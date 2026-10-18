"""Integration tests for the /api/rss endpoint in bitaxe_api.py.

Spins up the real BitaxeAPIHandler on a random localhost port, plus a stub
upstream HTTP server. The handler's feed map is pointed at the stub so no test
reaches the network.
"""
import json
import re
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import bitaxe_api  # noqa: E402

FEED_XML = b'<?xml version="1.0"?><rss><channel><title>Stub</title></channel></rss>'


class _StubUpstream(BaseHTTPRequestHandler):
    """Configurable upstream. Set class attrs before requests; `hits` counts GETs."""
    body = FEED_XML
    status = 200
    location = None
    trickle = False
    hits = 0

    def do_GET(self):
        type(self).hits += 1
        if self.trickle:
            # One byte every 0.2s against a large Content-Length: each read returns well
            # inside any per-read socket timeout, so only a deadline across reads can stop it.
            self.send_response(200)
            self.send_header('Content-Length', '100000')
            self.end_headers()
            try:
                for _ in range(50):
                    self.wfile.write(b'x')
                    self.wfile.flush()
                    time.sleep(0.2)
            except OSError:
                pass  # the proxy hung up, which is the point
            return
        if self.path == '/redirected':
            # Redirect target answers 200, so a proxy that followed the 3xx would succeed.
            self.send_response(200)
            self.send_header('Content-Length', str(len(FEED_XML)))
            self.end_headers()
            self.wfile.write(FEED_XML)
            return
        self.send_response(self.status)
        if self.location:
            self.send_header('Location', self.location)
        self.send_header('Content-Type', 'application/rss+xml')
        self.send_header('Content-Length', str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *a, **k):
        pass


class RssProxyTestBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []
        cls.proxy = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        # Threading, so a trickling response can't hold the stub for the next test.
        cls.upstream = ThreadingHTTPServer(('127.0.0.1', 0), _StubUpstream)
        cls.stub_url = f'http://127.0.0.1:{cls.upstream.server_address[1]}/feed'
        cls._saved_feeds = bitaxe_api.BitaxeAPIHandler.RSS_FEEDS
        for srv in (cls.proxy, cls.upstream):
            threading.Thread(target=srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        bitaxe_api.BitaxeAPIHandler.RSS_FEEDS = cls._saved_feeds
        cls.proxy.shutdown()
        cls.upstream.shutdown()

    def setUp(self):
        bitaxe_api.BitaxeAPIHandler.RSS_FEEDS = {'stub': self.stub_url}
        bitaxe_api._rss_cache.clear()
        _StubUpstream.body = FEED_XML
        _StubUpstream.status = 200
        _StubUpstream.location = None
        _StubUpstream.trickle = False
        _StubUpstream.hits = 0

    def _get(self, path, headers=None):
        url = f'http://127.0.0.1:{self.proxy.server_address[1]}{path}'
        req = urllib.request.Request(url, headers=headers or {})
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read()


class HappyPathTest(RssProxyTestBase):
    def test_returns_upstream_xml_verbatim(self):
        status, headers, body = self._get('/api/rss?feed=stub')
        self.assertEqual(status, 200)
        self.assertEqual(body, FEED_XML)

    def test_body_can_never_render_as_a_document(self):
        # Third-party XML on the dashboard's own origin: opened directly as application/xml,
        # an XHTML <script> in a compromised feed would run with access to /api/setup.
        # The dashboard only ever calls r.text(), so it loses nothing.
        _, headers, _ = self._get('/api/rss?feed=stub')
        self.assertEqual(headers['Content-Type'], 'text/plain; charset=utf-8')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(headers['Content-Security-Policy'], "default-src 'none'; sandbox")

    def test_second_request_within_ttl_is_served_from_cache(self):
        self._get('/api/rss?feed=stub')
        status, _, body = self._get('/api/rss?feed=stub')
        self.assertEqual(status, 200)
        self.assertEqual(body, FEED_XML)
        self.assertEqual(_StubUpstream.hits, 1)

    def test_expired_cache_entry_is_refetched(self):
        self._get('/api/rss?feed=stub')
        fetched_at, body = bitaxe_api._rss_cache['stub']
        bitaxe_api._rss_cache['stub'] = (fetched_at - bitaxe_api.RSS_CACHE_TTL - 1, body)
        self._get('/api/rss?feed=stub')
        self.assertEqual(_StubUpstream.hits, 2)


class RejectionTest(RssProxyTestBase):
    def _assert_error(self, path, status, error):
        got, _, body = self._get(path)
        self.assertEqual(got, status, f'{path}: expected {status}, got {got}')
        self.assertEqual(json.loads(body)['error'], error)
        self.assertEqual(_StubUpstream.hits, 0, 'upstream must not be contacted')

    def test_unknown_feed_key_rejected(self):
        self._assert_error('/api/rss?feed=nope', 400, 'unknown feed')

    def test_missing_feed_param_rejected(self):
        self._assert_error('/api/rss', 400, 'unknown feed')

    def test_url_as_feed_key_rejected(self):
        # The caller names a feed; it can never supply a destination.
        self._assert_error(f'/api/rss?feed={self.stub_url}', 400, 'unknown feed')

    def test_inherited_attribute_name_rejected(self):
        # A dict-membership check, not getattr(): names like __class__ are just unknown keys.
        self._assert_error('/api/rss?feed=__class__', 400, 'unknown feed')

    def test_disallowed_origin_forbidden(self):
        status, _, _ = self._get('/api/rss?feed=stub', headers={'Origin': 'https://evil.example'})
        self.assertEqual(status, 403)
        self.assertEqual(_StubUpstream.hits, 0)


class UpstreamFailureTest(RssProxyTestBase):
    def _assert_502(self):
        status, _, body = self._get('/api/rss?feed=stub')
        self.assertEqual(status, 502)
        self.assertIn('error', json.loads(body))
        # Negatively cached, so a hung or failing upstream is not retried on every poll.
        self.assertIsNone(bitaxe_api._rss_cache['stub'][1])

    def test_upstream_error_status_becomes_502(self):
        _StubUpstream.status = 500
        self._assert_502()

    def test_failure_is_not_retried_within_ttl(self):
        # Each retry of a hung upstream blocks the single-threaded server (and /api/miners)
        # for up to the fetch deadline; the dashboard polls every 300s.
        _StubUpstream.status = 500
        self._assert_502()
        status, _, _ = self._get('/api/rss?feed=stub')
        self.assertEqual(status, 502)
        self.assertEqual(_StubUpstream.hits, 1)

    def test_failed_refetch_serves_the_stale_copy(self):
        self._get('/api/rss?feed=stub')
        fetched_at, body = bitaxe_api._rss_cache['stub']
        bitaxe_api._rss_cache['stub'] = (fetched_at - bitaxe_api.RSS_CACHE_TTL - 1, body)
        _StubUpstream.status = 500
        status, _, got = self._get('/api/rss?feed=stub')
        self.assertEqual(status, 200)
        self.assertEqual(got, FEED_XML)
        # ...and the stale copy is re-stamped and kept, so the next poll does not retry
        # either, and still gets the copy.
        status, _, got = self._get('/api/rss?feed=stub')
        self.assertEqual((status, got), (200, FEED_XML))
        self.assertEqual(_StubUpstream.hits, 2)

    def test_cached_failure_is_retried_after_ttl(self):
        _StubUpstream.status = 500
        self._assert_502()
        fetched_at, _ = bitaxe_api._rss_cache['stub']
        bitaxe_api._rss_cache['stub'] = (fetched_at - bitaxe_api.RSS_CACHE_TTL - 1, None)
        _StubUpstream.status = 200
        status, _, got = self._get('/api/rss?feed=stub')
        self.assertEqual((status, got), (200, FEED_XML))
        self.assertEqual(_StubUpstream.hits, 2)
        self.assertEqual(bitaxe_api._rss_cache['stub'][1], FEED_XML)

    def test_ttl_outlasts_the_dashboard_poll_interval(self):
        # src/config.js REFRESH_INTERVALS.news is 5 * 60 * 1000 ms. A TTL below it means the
        # cache never serves a single dashboard's polls, and every poll refetches every feed.
        config_js = (ROOT / 'src' / 'config.js').read_text(encoding='utf-8')
        m = re.search(r'news:\s*(\d+)\s*\*\s*60\s*\*\s*1000', config_js)
        self.assertIsNotNone(m, 'REFRESH_INTERVALS.news not found in src/config.js')
        self.assertGreater(bitaxe_api.RSS_CACHE_TTL, int(m.group(1)) * 60)

    def test_redirect_is_not_followed(self):
        _StubUpstream.status = 302
        _StubUpstream.location = self.stub_url.replace('/feed', '/redirected')
        self._assert_502()
        self.assertEqual(_StubUpstream.hits, 1)

    def test_trickling_upstream_is_cut_off_at_the_total_deadline(self):
        # The urllib timeout is per socket read, so a byte-at-a-time upstream would hold
        # the single-threaded server indefinitely without an overall deadline.
        saved = bitaxe_api.RSS_FETCH_DEADLINE
        bitaxe_api.RSS_FETCH_DEADLINE = 1
        try:
            _StubUpstream.trickle = True
            started = time.monotonic()
            self._assert_502()
            self.assertLess(time.monotonic() - started, 3)
        finally:
            bitaxe_api.RSS_FETCH_DEADLINE = saved

    def test_oversized_body_rejected(self):
        _StubUpstream.body = b'x' * bitaxe_api.RSS_SIZE_LIMIT
        self._assert_502()


class FeedMapContractTest(unittest.TestCase):
    """The production map is the whole outbound allowlist for /api/rss."""

    def test_every_destination_is_https(self):
        for key, url in bitaxe_api.BitaxeAPIHandler.RSS_FEEDS.items():
            self.assertTrue(url.startswith('https://'), f'{key}: {url}')

    def test_keys_match_the_dashboard_feed_map(self):
        # src/config.js RSS_FEED_MAP is what the dashboard requests by key; a key on one
        # side only is a feed that silently never loads (or an allowlist entry nothing uses).
        config_js = (ROOT / 'src' / 'config.js').read_text(encoding='utf-8')
        block = re.search(r'const RSS_FEED_MAP = \[(.*?)\];', config_js, re.S)
        self.assertIsNotNone(block, 'RSS_FEED_MAP not found in src/config.js')
        js_keys = re.findall(r"key:\s*'([A-Za-z0-9]+)'", block.group(1))
        self.assertGreater(len(js_keys), 0)
        self.assertEqual(sorted(js_keys), sorted(bitaxe_api.BitaxeAPIHandler.RSS_FEEDS))


if __name__ == '__main__':
    unittest.main()
