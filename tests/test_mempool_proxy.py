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
        # Allow 'localhost' for stub upstream; production default is frozenset()
        bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_HOSTS = frozenset({'localhost'})

        # Use port 0 — OS assigns an available port atomically, no TOCTOU race.
        cls.proxy = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        cls.proxy_port = cls.proxy.server_address[1]
        cls.upstream = HTTPServer(('127.0.0.1', 0), _StubUpstream)
        cls.upstream_port = cls.upstream.server_address[1]

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
        # 'localhost' is a hostname; passes because ALLOWED_PROXY_HOSTS includes
        # 'localhost' in tests (patched in setUpClass for stub infrastructure).
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

    def test_missing_path_param_rejected(self):
        # parse_qs returns '' for absent key; empty string must also be rejected.
        status, body = self._get(f'/api/mempool-proxy?base={self.base}')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'invalid path')


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
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_loopback_ipv6_rejected(self):
        status, body = self._get_raw('base=http://[::1]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_link_local_ipv4_rejected(self):
        status, body = self._get_raw('base=http://169.254.169.254&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_link_local_ipv6_rejected(self):
        status, body = self._get_raw('base=http://[fe80::1]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_unspecified_ipv4_rejected(self):
        # 0.0.0.0 routes to localhost on Linux — must be blocked
        status, body = self._get_raw('base=http://0.0.0.0&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_unspecified_ipv6_rejected(self):
        # :: routes to localhost on Linux — must be blocked
        status, body = self._get_raw('base=http://[::]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_ipv4_mapped_loopback_rejected(self):
        # ::ffff:127.0.0.1 is IPv4-mapped IPv6; is_loopback=False but connects to 127.0.0.1
        status, body = self._get_raw('base=http://[::ffff:127.0.0.1]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')

    def test_ipv4_mapped_link_local_rejected(self):
        # ::ffff:169.254.169.254 is IPv4-mapped IPv6; is_link_local=False but reaches metadata range
        status, body = self._get_raw('base=http://[::ffff:169.254.169.254]&path=/api/x')
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], 'loopback/link-local destinations not allowed')


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
        # Point at a port nobody is listening on — allocate via port 0 then close immediately.
        import socket
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        bad = s.getsockname()[1]
        s.close()
        base = f'http://localhost:{bad}'
        status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/x')
        self.assertEqual(status, 502)
        self.assertTrue(json.loads(body)['error'].startswith('proxy failed'))


class HostnameAllowlistTest(MempoolProxyTestBase):
    """Hostname-based base URLs are rejected unless explicitly in ALLOWED_PROXY_HOSTS."""

    def test_unlisted_hostname_rejected(self):
        # evil.com is a hostname; not in the allowlist (even in tests,
        # where only 'localhost' is added for stub infrastructure)
        status, body = self._get(
            '/api/mempool-proxy?base=http://evil.com&path=/api/v1/blocks/tip/height'
        )
        self.assertEqual(status, 400)
        self.assertEqual(
            json.loads(body)['error'],
            'hostname-based proxy URLs are not supported; use an IP address'
        )

    def test_listed_hostname_allowed(self):
        # 'localhost' is added to ALLOWED_PROXY_HOSTS in MempoolProxyTestBase.setUpClass
        # (test infrastructure; production default is frozenset())
        _StubUpstream.body = b'{"height": 900000}'
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(
                f'/api/mempool-proxy?base={base}&path=/api/v1/blocks/tip/height'
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {'height': 900000})
        finally:
            _StubUpstream.body = b'{"ok": true}'
            _StubUpstream.status = 200


class RedirectTest(MempoolProxyTestBase):
    """The base-host SSRF guard only validates the URL the caller supplied —
    if the proxy follows a 3xx redirect, the redirect target bypasses that
    guard entirely. A reachable-but-otherwise-fine host can 302 the proxy
    into 127.0.0.1 or link-local metadata. Uses two dedicated, throwaway
    handler classes (not the shared _StubUpstream) so their per-test state
    can't bleed into other tests."""

    def test_redirect_to_internal_target_not_followed(self):
        sentinel = b'{"SECRET": "INTERNAL-SENTINEL-9f3a"}'

        class _InternalTargetHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(sentinel)))
                self.end_headers()
                self.wfile.write(sentinel)

            def log_message(self, *a, **k):
                pass  # silence

        internal = HTTPServer(('127.0.0.1', 0), _InternalTargetHandler)
        internal_port = internal.server_address[1]
        internal_thread = threading.Thread(target=internal.serve_forever, daemon=True)
        internal_thread.start()

        class _RedirectingUpstreamHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(302)
                self.send_header('Location', f'http://127.0.0.1:{internal_port}/secret')
                self.send_header('Content-Length', '0')
                self.end_headers()

            def log_message(self, *a, **k):
                pass  # silence

        redirecting = HTTPServer(('127.0.0.1', 0), _RedirectingUpstreamHandler)
        redirecting_port = redirecting.server_address[1]
        redirecting_thread = threading.Thread(target=redirecting.serve_forever, daemon=True)
        redirecting_thread.start()

        try:
            # 'localhost' passes ALLOWED_PROXY_HOSTS (patched in setUpClass) —
            # that's the vector: the guard sees a fine host, then the
            # response redirects the fetch to an internal target.
            base = f'http://localhost:{redirecting_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/x')
            self.assertNotEqual(status, 200, f'redirect was followed to 200; body={body!r}')
            self.assertNotIn(
                b'INTERNAL-SENTINEL-9f3a', body,
                'internal-target sentinel leaked into proxy response — redirect was followed'
            )
        finally:
            internal.shutdown()
            internal.server_close()
            redirecting.shutdown()
            redirecting.server_close()


if __name__ == '__main__':
    unittest.main()
