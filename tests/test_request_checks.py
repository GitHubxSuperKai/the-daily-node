"""Request checks on the API routes: the Host the request names, and the
Sec-Fetch-Site a browser sends when there is no Origin or Referer."""
import http.client
import os
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bitaxe_api  # noqa: E402
from bitaxe_api import is_host_allowed  # noqa: E402

POLL_INTERVAL = 0.05
DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000']

READ_PATHS = [
    '/api/setup',
    '/api/miners',
    '/api/firmware',
    '/api/rss?feed=optech',
    '/api/mempool-proxy?base=https%3A%2F%2F10.0.0.5%3A3006&path=%2Fapi%2Fmempool',
]


class TestIsHostAllowed(unittest.TestCase):
    def test_ip_literals(self):
        for host in ('127.0.0.1:3001', '10.0.0.5:3001', '[::1]:3001', '127.0.0.1'):
            self.assertTrue(is_host_allowed(host, []), host)

    def test_localhost(self):
        self.assertTrue(is_host_allowed('localhost:3001', []))
        self.assertTrue(is_host_allowed('LOCALHOST:3001', []))

    def test_missing_host(self):
        self.assertTrue(is_host_allowed(None, []))
        self.assertTrue(is_host_allowed('', []))

    def test_name_needs_allowlisted_origin(self):
        self.assertFalse(is_host_allowed('node.example:3001', DEFAULT_ORIGINS))
        # Any port: the dashboard may be served on 3000 and the API on 3001.
        self.assertTrue(is_host_allowed('node.example:3001', ['http://node.example:3000']))

    def test_malformed(self):
        self.assertFalse(is_host_allowed(':3001', DEFAULT_ORIGINS))


class TestRequestChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._saved = (bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS,
                      bitaxe_api.fetch_all_miners, bitaxe_api.latest_firmware,
                      bitaxe_api._fetch_feed)
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = DEFAULT_ORIGINS + ['http://node.example:3001']
        # No upstream traffic: every handler that would fetch gets a canned answer.
        bitaxe_api.fetch_all_miners = lambda: []
        bitaxe_api.latest_firmware = lambda: 'v2.0.0'
        bitaxe_api._fetch_feed = lambda target: b'<rss/>'
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        (bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS, bitaxe_api.fetch_all_miners,
         bitaxe_api.latest_firmware, bitaxe_api._fetch_feed) = cls._saved
        bitaxe_api._rss_cache.clear()

    def _get(self, path, headers):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            # skip_host so the test controls the Host header (or sends none).
            conn.putrequest('GET', path, skip_host=True)
            for k, v in headers.items():
                conn.putheader(k, v)
            conn.endheaders()
            resp = conn.getresponse()
            return resp.status, resp.headers, resp.read()
        finally:
            conn.close()

    def test_unknown_host_refused_on_every_read(self):
        for path in READ_PATHS:
            with self.subTest(path=path):
                status, headers, body = self._get(path, {'Host': f'other.example:{self.port}'})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')
                self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_dashboard_hosts_still_served(self):
        for host in (f'127.0.0.1:{self.port}', f'localhost:{self.port}',
                     f'node.example:{self.port}', f'10.0.0.5:{self.port}'):
            with self.subTest(host=host):
                status, _, body = self._get('/api/setup', {'Host': host})
                self.assertEqual(status, 200)
                self.assertIn(b'bitaxe_ips', body)

    def test_same_origin_browser_read_allowed(self):
        status, _, _ = self._get('/api/firmware', {
            'Host': f'127.0.0.1:{self.port}', 'Sec-Fetch-Site': 'same-origin'})
        self.assertEqual(status, 200)

    def test_no_host_header_allowed(self):
        status, _, _ = self._get('/api/setup', {})
        self.assertEqual(status, 200)

    def test_headerless_request_from_other_site_refused(self):
        for site in ('cross-site', 'same-site'):
            for path in READ_PATHS:
                with self.subTest(site=site, path=path):
                    status, headers, body = self._get(path, {
                        'Host': f'127.0.0.1:{self.port}', 'Sec-Fetch-Site': site})
                    self.assertEqual(status, 403)
                    # The body names the check, so a 403 from a route's own
                    # validation (the mempool-proxy allowlist) can't pass for it.
                    self.assertEqual(body, b'Forbidden: origin not allowed')
                    self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_allowed_cross_port_origin_gets_cors(self):
        status, headers, _ = self._get('/api/firmware', {
            'Host': f'localhost:{self.port}', 'Origin': 'http://localhost:3000',
            'Sec-Fetch-Site': 'same-site'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
        self.assertEqual(headers.get('Vary'), 'Origin')

    def test_other_origin_refused(self):
        status, headers, _ = self._get('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'https://other.example',
            'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(status, 403)
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))


if __name__ == '__main__':
    unittest.main()
