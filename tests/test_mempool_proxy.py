"""Integration tests for the /api/mempool-proxy endpoint in bitaxe_api.py.

Spins up the real BitaxeAPIHandler on a random localhost port, plus a stub
upstream HTTP server. Exercises the security boundaries with real HTTP
requests — no monkeypatching of internals.
"""
import json
import sys
import threading
import unittest
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Make bitaxe_api importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bitaxe_api  # noqa: E402


def _free_port():
    """Bind to port 0 and return the OS-assigned port."""
    import socket
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


class _StubUpstream(BaseHTTPRequestHandler):
    """Configurable upstream. Set class attrs body / status before requests."""
    body = b'{"ok": true}'
    status = 200

    def do_GET(self):
        self.send_response(self.status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *a, **k):
        pass  # silence


class MempoolProxyTestBase(unittest.TestCase):
    """Bring up the real handler + a stub upstream, both on random ports."""

    @classmethod
    def setUpClass(cls):
        # Allow same-origin (no Origin header) — _check_origin returns True
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []

        cls.proxy_port = _free_port()
        cls.upstream_port = _free_port()

        cls.proxy = HTTPServer(('127.0.0.1', cls.proxy_port), bitaxe_api.BitaxeAPIHandler)
        cls.upstream = HTTPServer(('127.0.0.1', cls.upstream_port), _StubUpstream)

        cls.proxy_thread = threading.Thread(target=cls.proxy.serve_forever, daemon=True)
        cls.upstream_thread = threading.Thread(target=cls.upstream.serve_forever, daemon=True)
        cls.proxy_thread.start()
        cls.upstream_thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.proxy.shutdown()
        cls.upstream.shutdown()

    def _get(self, path):
        """Return (status, body_bytes). Doesn't raise on 4xx/5xx."""
        url = f'http://127.0.0.1:{self.proxy_port}{path}'
        req = urllib.request.Request(url)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()


class SanityTest(MempoolProxyTestBase):
    def test_proxy_responds_at_all(self):
        # Hit /api/miners which always returns a JSON shape, just to prove the
        # server is up.
        status, body = self._get('/api/miners')
        self.assertEqual(status, 200)
        self.assertIn(b'"miners"', body)


class HappyPathTest(MempoolProxyTestBase):
    def setUp(self):
        _StubUpstream.body = b'{"height": 800000}'
        _StubUpstream.status = 200

    def test_proxies_upstream_body_verbatim(self):
        # 'localhost' is a hostname, not a bare IP, so loopback IP check
        # falls through (per bitaxe_api.py:225-226). Actual DNS resolution
        # then hits 127.0.0.1, which is what we want here.
        base = f'http://localhost:{self.upstream_port}'
        path = '/api/blocks/tip/height'
        status, body = self._get(f'/api/mempool-proxy?base={base}&path={path}')
        self.assertEqual(status, 200)
        self.assertEqual(body, b'{"height": 800000}')


class PathTraversalTest(MempoolProxyTestBase):
    """All these inputs must be rejected with HTTP 400 before any upstream call."""

    def setUp(self):
        self.base = f'http://localhost:{self.upstream_port}'

    def _assert_rejected(self, path, *, reason='invalid path'):
        status, body = self._get(f'/api/mempool-proxy?base={self.base}&path={path}')
        self.assertEqual(status, 400, f'expected 400 for path={path!r}, got {status}')
        payload = json.loads(body)
        self.assertIn('error', payload)
        self.assertEqual(payload['error'], reason)

    def test_empty_path_rejected(self):
        self._assert_rejected('')

    def test_path_without_api_prefix_rejected(self):
        self._assert_rejected('/etc/passwd')

    def test_dotdot_segment_rejected(self):
        self._assert_rejected('/api/../etc/passwd')

    def test_dotdot_segment_mid_path_rejected(self):
        self._assert_rejected('/api/v1/../../secret')


class BaseUrlValidationTest(MempoolProxyTestBase):
    def _get_raw(self, qs):
        """Raw query string — caller already URL-encoded."""
        return self._get(f'/api/mempool-proxy?{qs}')

    def test_missing_base_rejected(self):
        status, body = self._get_raw('path=/api/blocks/tip/height')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'invalid base URL')

    def test_non_http_scheme_rejected(self):
        status, body = self._get_raw('base=file:///etc/passwd&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'invalid base URL')

    def test_ftp_scheme_rejected(self):
        status, body = self._get_raw('base=ftp://example.com&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'invalid base URL')

    def test_loopback_ipv4_rejected(self):
        status, body = self._get_raw(f'base=http://127.0.0.1:{self.upstream_port}&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback destinations not allowed')

    def test_loopback_ipv6_rejected(self):
        status, body = self._get_raw('base=http://[::1]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback destinations not allowed')


class ResponseSizeCapTest(MempoolProxyTestBase):
    def test_oversized_upstream_response_returns_502(self):
        # _PROXY_SIZE_LIMIT is 512 KiB. Generate a body that exceeds it.
        _StubUpstream.body = b'x' * (520 * 1024)
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/bulk')
            self.assertEqual(status, 502)
            self.assertEqual(json.loads(body)['error'], 'upstream response too large')
        finally:
            _StubUpstream.body = b'{"ok": true}'  # restore

    def test_under_cap_passes_through(self):
        _StubUpstream.body = b'y' * (400 * 1024)
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/medium')
            self.assertEqual(status, 200)
            self.assertEqual(len(body), 400 * 1024)
        finally:
            _StubUpstream.body = b'{"ok": true}'


class UpstreamErrorTest(MempoolProxyTestBase):
    def test_upstream_404_propagates_as_404(self):
        _StubUpstream.status = 404
        _StubUpstream.body = b'not found'
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/missing')
            self.assertEqual(status, 404)
            self.assertEqual(json.loads(body)['error'], 'upstream 404')
        finally:
            _StubUpstream.status = 200
            _StubUpstream.body = b'{"ok": true}'

    def test_upstream_500_propagates_as_500(self):
        _StubUpstream.status = 500
        _StubUpstream.body = b'oops'
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/boom')
            self.assertEqual(status, 500)
            self.assertEqual(json.loads(body)['error'], 'upstream 500')
        finally:
            _StubUpstream.status = 200
            _StubUpstream.body = b'{"ok": true}'

    def test_connection_failure_returns_502(self):
        # Point at a port nobody is listening on.
        bad = _free_port()
        base = f'http://localhost:{bad}'
        status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/x')
        self.assertEqual(status, 502)
        self.assertTrue(json.loads(body)['error'].startswith('proxy failed'))


if __name__ == '__main__':
    unittest.main()
