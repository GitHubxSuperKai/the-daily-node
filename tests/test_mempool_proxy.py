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

        # Authorize the stub upstream in the outbound allowlist (production default
        # is frozenset() — every destination rejected). Tests that use a different
        # destination register it via _allow_bases().
        cls._base_upstream = f'http://localhost:{cls.upstream_port}'
        cls._allow_bases(cls._base_upstream)

        cls.proxy_thread = threading.Thread(target=cls.proxy.serve_forever, daemon=True)
        cls.upstream_thread = threading.Thread(target=cls.upstream.serve_forever, daemon=True)
        cls.proxy_thread.start()
        cls.upstream_thread.start()

    @classmethod
    def _allow_bases(cls, *bases):
        """Add normalized base URLs to the handler's outbound proxy allowlist."""
        current = set(bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_BASES)
        for b in bases:
            current.add(bitaxe_api.normalize_proxy_base(b))
        bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_BASES = frozenset(current)

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
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/v1/blocks')
            self.assertEqual(status, 502)
            self.assertEqual(json.loads(body)['error'], 'upstream response too large')
        finally:
            _StubUpstream.body = b'{"ok": true}'  # restore

    def test_under_cap_passes_through(self):
        _StubUpstream.body = b'y' * (400 * 1024)
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/mempool')
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
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/v1/blocks')
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
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/v1/blocks')
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
        self._allow_bases(base)  # authorize so the request reaches the connection attempt
        status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/v1/blocks')
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
                f'/api/mempool-proxy?base={base}&path=/api/blocks/tip/height'
            )
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {'height': 900000})
        finally:
            _StubUpstream.body = b'{"ok": true}'
            _StubUpstream.status = 200


class OutboundAllowlistTest(MempoolProxyTestBase):
    """The destination origin must be explicitly authorized server-side
    (--allow-proxy / config proxy_hosts). This is the SSRF gate (CWE-918):
    an otherwise-reachable host is refused unless it is on the allowlist."""

    def test_unlisted_host_rejected(self):
        # A non-loopback, non-link-local host (RFC 5737 TEST-NET-3) clears the IP
        # guards but is NOT on the allowlist, so the proxy must refuse it before
        # any network call — the allowlist is the authoritative gate.
        status, body = self._get(
            '/api/mempool-proxy?base=http://203.0.113.10:3006&path=/api/blocks/tip/height'
        )
        self.assertEqual(status, 403)
        self.assertEqual(json.loads(body)['error'], 'destination not in proxy allowlist')

    def test_listed_base_with_trailing_slash_matches(self):
        # Normalization drops the trailing slash / path, so the registered base matches.
        _StubUpstream.body = b'{"ok": 1}'
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}/'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/blocks/tip/height')
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(body), {'ok': 1})
        finally:
            _StubUpstream.body = b'{"ok": true}'

    def test_path_cannot_smuggle_a_different_host(self):
        # Authority-smuggling attempts in the path (@, ?, extra slashes) are not among the
        # allowlisted mempool endpoints, so the endpoint allowlist refuses them outright
        # before any upstream request — a strictly stronger guarantee than relying on URL
        # parsing to keep the smuggle chars in the path component.
        _StubUpstream.body = b'{"from": "stub"}'
        _StubUpstream.status = 200
        try:
            base = f'http://localhost:{self.upstream_port}'
            for smuggle in ('/api/x@evil.com/y', '/api/x?next=http://evil.com', '/api//evil.com/z'):
                status, body = self._get(f'/api/mempool-proxy?base={base}&path={smuggle}')
                self.assertEqual(status, 400, f'path {smuggle!r} was not refused')
                self.assertEqual(json.loads(body)['error'], 'path not in proxy endpoint allowlist',
                                 f'path {smuggle!r} refused for the wrong reason')
        finally:
            _StubUpstream.body = b'{"ok": true}'

    def test_empty_allowlist_rejects_everything(self):
        # Secure default: with no authorized destinations, every proxy request is refused.
        saved = bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_BASES
        bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_BASES = frozenset()
        try:
            base = f'http://localhost:{self.upstream_port}'
            status, body = self._get(f'/api/mempool-proxy?base={base}&path=/api/x')
            self.assertEqual(status, 403)
            self.assertEqual(json.loads(body)['error'], 'destination not in proxy allowlist')
        finally:
            bitaxe_api.BitaxeAPIHandler.ALLOWED_PROXY_BASES = saved


class EndpointAllowlistTest(MempoolProxyTestBase):
    """The caller-controlled `path` is constrained to the specific mempool
    endpoints the dashboard actually requests (CodeQL py/partial-ssrf #191).
    Only those reach the authorized upstream; any other /api/* path is refused
    even when the destination host is already on the outbound allowlist."""

    ENDPOINT_ERR = 'path not in proxy endpoint allowlist'

    def setUp(self):
        _StubUpstream.body = b'{"ok": true}'
        _StubUpstream.status = 200
        self.base = self._base_upstream

    def test_unlisted_api_path_rejected(self):
        # Clears the /api/ prefix + no-traversal guard, and the destination host is
        # authorized, but it is not an endpoint the dashboard uses — the endpoint
        # allowlist must refuse it before any upstream request.
        status, body = self._get(
            f'/api/mempool-proxy?base={self.base}&path=/api/v1/internal/secret'
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], self.ENDPOINT_ERR)

    def test_listed_static_path_allowed(self):
        status, body = self._get(
            f'/api/mempool-proxy?base={self.base}&path=/api/mempool'
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'ok': True})

    def test_pool_blocks_parametric_path_allowed(self):
        # The one parametric endpoint the dashboard requests, with a realistic slug.
        status, body = self._get(
            f'/api/mempool-proxy?base={self.base}&path=/api/v1/mining/pool/foundryusa/blocks'
        )
        self.assertEqual(status, 200)

    def test_pool_blocks_wrong_suffix_rejected(self):
        # Correct prefix + valid slug chars but not the /blocks suffix. Proves the
        # parametric matcher is anchored (full match), not a permissive prefix pass.
        status, body = self._get(
            f'/api/mempool-proxy?base={self.base}&path=/api/v1/mining/pool/foundryusa/txs'
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], self.ENDPOINT_ERR)

    def test_pool_blocks_injection_char_in_slug_rejected(self):
        # An authority/injection char in the slug must fail the restrictive match.
        status, body = self._get(
            f'/api/mempool-proxy?base={self.base}&path=/api/v1/mining/pool/foo@evil.com/blocks'
        )
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(body)['error'], self.ENDPOINT_ERR)


class NormalizeProxyBaseTest(unittest.TestCase):
    """Pure-function coverage for the base-URL canonicalizer that backs the allowlist."""

    def test_default_ports_are_explicit(self):
        self.assertEqual(bitaxe_api.normalize_proxy_base('http://host'), 'http://host:80')
        self.assertEqual(bitaxe_api.normalize_proxy_base('https://host'), 'https://host:443')

    def test_case_and_path_and_slash_stripped(self):
        self.assertEqual(
            bitaxe_api.normalize_proxy_base('HTTP://Host:3006/api/foo?q=1#frag'),
            'http://host:3006',
        )

    def test_ipv6_bracketed(self):
        self.assertEqual(bitaxe_api.normalize_proxy_base('http://[2001:db8::1]:8080'),
                         'http://[2001:db8::1]:8080')

    def test_invalid_scheme_and_port_and_empty(self):
        self.assertIsNone(bitaxe_api.normalize_proxy_base('ftp://host'))
        self.assertIsNone(bitaxe_api.normalize_proxy_base('file:///etc/passwd'))
        self.assertIsNone(bitaxe_api.normalize_proxy_base('http://host:notaport'))
        self.assertIsNone(bitaxe_api.normalize_proxy_base(''))
        self.assertIsNone(bitaxe_api.normalize_proxy_base(None))

    def test_validate_dedupes_and_collects_errors(self):
        valid, errors = bitaxe_api.validate_proxy_bases(
            ['https://n:3006', 'https://n:3006/', 'gopher://x']
        )
        self.assertEqual(valid, ['https://n:3006'])  # dupe (trailing slash) collapsed
        self.assertEqual(len(errors), 1)  # gopher scheme rejected


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
            self._allow_bases(base)  # authorize the entry host; the redirect target is not
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
