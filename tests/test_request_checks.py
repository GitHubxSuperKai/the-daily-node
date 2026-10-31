"""Request checks on the API routes (_check_origin), on GET, OPTIONS and POST: the
Host the request names, the Origin or Referer, and the Sec-Fetch-Site a browser sends
when there is neither."""
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
        for host in (':3001', '[', '[::1', 'a]:1'):
            self.assertFalse(is_host_allowed(host, DEFAULT_ORIGINS), host)

    def test_bracketed_ipv6_allowed(self):
        for host in ('[::1]:3001', '[::ffff:127.0.0.1]:3001', '[::1]'):
            self.assertTrue(is_host_allowed(host, []), host)

    def test_bracket_content_that_is_not_ipv6_refused(self):
        # Brackets are for IPv6 literals only: a name or IPv4 address inside them is
        # refused, even when that name is the host of an allowlisted origin.
        allowlist = DEFAULT_ORIGINS + ['http://node.example:3000']
        for host in ('[node.example]:3001', '[localhost]:3001', '[127.0.0.1]:3001',
                     '[other.example]', '[::1]x:3001', 'x[::1]:3001', '[]:3001'):
            self.assertFalse(is_host_allowed(host, allowlist), host)


class TestRequestChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Cleanups run last-registered first, so each is registered right after the
        # thing it undoes: a failure part-way through setup still unwinds what was done.
        handler = bitaxe_api.BitaxeAPIHandler
        cls.addClassCleanup(setattr, handler, 'ALLOWED_ORIGINS', handler.ALLOWED_ORIGINS)
        for name in ('fetch_all_miners', 'latest_firmware', '_fetch_feed'):
            cls.addClassCleanup(setattr, bitaxe_api, name, getattr(bitaxe_api, name))
        cls.addClassCleanup(bitaxe_api._rss_cache.clear)
        handler.ALLOWED_ORIGINS = DEFAULT_ORIGINS + ['http://node.example:3001']
        # No upstream traffic: every handler that would fetch gets a canned answer.
        bitaxe_api.fetch_all_miners = lambda: []
        bitaxe_api.latest_firmware = lambda: 'v2.0.0'
        bitaxe_api._fetch_feed = lambda target: b'<rss/>'
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        cls.addClassCleanup(cls.server.server_close)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.thread.join)
        cls.addClassCleanup(cls.server.shutdown)

    def _request(self, method, path, headers, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            # skip_host so the test controls the Host header (or sends none).
            conn.putrequest(method, path, skip_host=True)
            for k, v in headers.items():
                conn.putheader(k, v)
            if body is not None:
                conn.putheader('Content-Type', 'application/json')
                conn.putheader('Content-Length', str(len(body)))
            conn.endheaders(body)
            resp = conn.getresponse()
            return resp.status, resp.headers, resp.read()
        finally:
            conn.close()

    def _get(self, path, headers):
        return self._request('GET', path, headers)

    def _options(self, path, headers):
        return self._request('OPTIONS', path, headers)

    def _post(self, path, headers, body):
        return self._request('POST', path, headers, body)

    def test_unknown_host_refused_on_every_read(self):
        for path in READ_PATHS:
            with self.subTest(path=path):
                status, headers, body = self._get(path, {'Host': f'other.example:{self.port}'})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')
                self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_malformed_host_refused(self):
        for host in ('[', '[::1'):
            with self.subTest(host=host):
                status, _, body = self._get('/api/setup', {'Host': host})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')

    def test_bracketed_name_host_refused(self):
        for host in (f'[node.example]:{self.port}', f'[localhost]:{self.port}',
                     f'[127.0.0.1]:{self.port}'):
            with self.subTest(host=host):
                status, _, body = self._get('/api/setup', {'Host': host})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')

    def test_bracketed_ipv6_host_served(self):
        status, _, _ = self._get('/api/setup', {'Host': f'[::1]:{self.port}'})
        self.assertEqual(status, 200)

    def test_malformed_referer_refused(self):
        # With no Origin the Referer is checked, and a bad one is refused the same way.
        for referer in ('http://[', 'not a url', '/index.html', 'http://'):
            with self.subTest(referer=referer):
                status, headers, body = self._get('/api/setup', {
                    'Host': f'127.0.0.1:{self.port}', 'Referer': referer})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: malformed origin')
                self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_other_site_referer_refused(self):
        # With no Origin the Referer stands in for it, so a request whose Referer names
        # another site is refused by the allowlist, whatever Sec-Fetch-Site says.
        for site in ('cross-site', None):
            with self.subTest(site=site):
                headers = {'Host': f'127.0.0.1:{self.port}',
                           'Referer': 'https://other.example/page.html'}
                if site:
                    headers['Sec-Fetch-Site'] = site
                status, resp_headers, body = self._get('/api/setup', headers)
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: origin not allowed')
                self.assertIsNone(resp_headers.get('Access-Control-Allow-Origin'))

    def test_allowed_referer_served(self):
        status, headers, _ = self._get('/api/setup', {
            'Host': f'localhost:{self.port}', 'Referer': 'http://localhost:3000/index.html',
            'Sec-Fetch-Site': 'same-site'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')

    def test_malformed_origin_refused(self):
        status, _, body = self._get('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'http://['})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: malformed origin')

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

    # OPTIONS preflights go through the same checks as reads.

    def test_options_unknown_host_refused(self):
        status, headers, body = self._options('/api/setup', {
            'Host': f'other.example:{self.port}', 'Origin': 'http://localhost:3000'})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: host not allowed')
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_options_other_origin_refused(self):
        status, headers, body = self._options('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'https://other.example',
            'Access-Control-Request-Method': 'POST'})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: origin not allowed')
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_options_headerless_from_other_site_refused(self):
        status, _, body = self._options('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Sec-Fetch-Site': 'cross-site'})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: origin not allowed')

    def test_options_allowed_origin_gets_cors(self):
        status, headers, _ = self._options('/api/setup', {
            'Host': f'localhost:{self.port}', 'Origin': 'http://localhost:3000',
            'Access-Control-Request-Method': 'POST'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')
        self.assertEqual(headers.get('Vary'), 'Origin')

    # POST /api/setup: the refused cases never reach the body, and the accepted case
    # sends an invalid body so it stops at validation without writing the config file.

    def test_post_unknown_host_refused(self):
        status, _, body = self._post('/api/setup', {
            'Host': f'other.example:{self.port}', 'Origin': 'http://localhost:3000'},
            b'{"bitaxe_ips": []}')
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: host not allowed')

    def test_post_other_origin_refused(self):
        status, _, body = self._post('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'https://other.example'},
            b'{"bitaxe_ips": []}')
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: origin not allowed')

    def test_post_headerless_from_other_site_refused(self):
        status, _, body = self._post('/api/setup', {
            'Host': f'127.0.0.1:{self.port}', 'Sec-Fetch-Site': 'same-site'},
            b'{"bitaxe_ips": []}')
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: origin not allowed')

    def test_post_allowed_origin_passes_checks(self):
        status, headers, body = self._post('/api/setup', {
            'Host': f'localhost:{self.port}', 'Origin': 'http://localhost:3000'},
            b'{}')
        self.assertEqual(status, 400)
        self.assertIn(b'bitaxe_ips must be a list', body)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), 'http://localhost:3000')


if __name__ == '__main__':
    unittest.main()
