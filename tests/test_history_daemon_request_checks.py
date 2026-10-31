"""history_daemon runs the request checks bitaxe_api's _check_origin runs, on every
route: the Host allowlist (bitaxe_api.is_host_allowed, covered in test_request_checks.py),
the Origin (or Referer) allowlist, and the Sec-Fetch-Site check when neither is sent."""
import http.client
import os
import shutil
import sqlite3
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import bitaxe_api  # noqa: E402
import history_daemon  # noqa: E402
from history_daemon import (  # noqa: E402
    HistoryHandler,
    ensure_schema,
    resolve_allowed_origins,
)

POLL_INTERVAL = 0.05
DASHBOARD = 'http://node.example:3001'


class TestHistoryDaemonHost(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Cleanups run last-registered first, so each is registered right after the
        # thing it undoes.
        tmpdir = tempfile.mkdtemp()
        cls.addClassCleanup(shutil.rmtree, tmpdir, ignore_errors=True)
        db_path = os.path.join(tmpdir, 'test.db')
        conn = sqlite3.connect(db_path)
        try:
            ensure_schema(conn)
        finally:
            conn.close()
        cls.addClassCleanup(setattr, HistoryHandler, 'db_path', HistoryHandler.db_path)
        cls.addClassCleanup(setattr, HistoryHandler, 'allowed_origins',
                            HistoryHandler.allowed_origins)
        HistoryHandler.db_path = db_path
        HistoryHandler.allowed_origins = resolve_allowed_origins([DASHBOARD])
        cls.server = history_daemon.SERVER_CLASS(('127.0.0.1', 0), HistoryHandler)
        cls.addClassCleanup(cls.server.server_close)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.thread.join)
        cls.addClassCleanup(cls.server.shutdown)

    def _request(self, method, path, headers):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        try:
            # skip_host so the test controls the Host header (or sends none).
            conn.putrequest(method, path, skip_host=True)
            for k, v in headers.items():
                conn.putheader(k, v)
            conn.endheaders()
            resp = conn.getresponse()
            return resp.status, resp.headers, resp.read()
        finally:
            conn.close()

    def test_uses_the_api_server_helper(self):
        self.assertIs(history_daemon.is_host_allowed, bitaxe_api.is_host_allowed)

    def test_unknown_host_refused(self):
        for method, path in (('GET', '/history/price'), ('GET', '/history/nope'),
                             ('OPTIONS', '/history/price')):
            with self.subTest(method=method, path=path):
                status, headers, body = self._request(method, path, {
                    'Host': f'other.example:{self.port}', 'Origin': DASHBOARD})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')
                self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_malformed_and_bracketed_host_refused(self):
        for host in ('[', '[::1', f'[node.example]:{self.port}', f'[127.0.0.1]:{self.port}',
                     f'other.example@127.0.0.1:{self.port}', f'127.0.0.1:{self.port}/x',
                     f'localhost:{self.port}?x', f'localhost:{self.port}#x',
                     f'[::1]x:{self.port}', f'[::1]:{self.port}x'):
            with self.subTest(host=host):
                status, _, body = self._request('GET', '/history/price', {'Host': host})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: host not allowed')

    def test_ip_localhost_and_allowlisted_name_served(self):
        for host in (f'127.0.0.1:{self.port}', f'localhost:{self.port}', f'[::1]:{self.port}',
                     f'10.0.0.5:{self.port}', f'node.example:{self.port}', 'NODE.example'):
            with self.subTest(host=host):
                status, _, body = self._request('GET', '/history/price', {'Host': host})
                self.assertEqual(status, 200)
                self.assertEqual(body, b'[]')

    def test_no_host_header_served(self):
        status, _, _ = self._request('GET', '/history/price', {})
        self.assertEqual(status, 200)

    def test_allowed_host_keeps_cors(self):
        status, headers, _ = self._request('OPTIONS', '/history/price', {
            'Host': f'node.example:{self.port}', 'Origin': DASHBOARD})
        self.assertEqual(status, 204)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), DASHBOARD)

    def test_name_needs_an_allowed_origin(self):
        # The default (localhost) allowlist has no host names, so a name is refused.
        saved = HistoryHandler.allowed_origins
        self.addCleanup(setattr, HistoryHandler, 'allowed_origins', saved)
        HistoryHandler.allowed_origins = resolve_allowed_origins(None)
        status, _, body = self._request('GET', '/history/price', {
            'Host': f'node.example:{self.port}'})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: host not allowed')

    def test_headerless_request_from_other_site_refused(self):
        for site in ('cross-site', 'same-site', 'CROSS-SITE'):
            for method in ('GET', 'OPTIONS'):
                with self.subTest(site=site, method=method):
                    status, headers, body = self._request(method, '/history/price', {
                        'Host': f'127.0.0.1:{self.port}', 'Sec-Fetch-Site': site})
                    self.assertEqual(status, 403)
                    self.assertEqual(body, b'Forbidden: origin not allowed')
                    self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_headerless_same_origin_or_direct_request_served(self):
        for site in ('same-origin', 'none', None):
            with self.subTest(site=site):
                headers = {'Host': f'127.0.0.1:{self.port}'}
                if site:
                    headers['Sec-Fetch-Site'] = site
                status, _, _ = self._request('GET', '/history/price', headers)
                self.assertEqual(status, 200)

    def test_same_site_with_allowed_origin_or_referer_served(self):
        # The dashboard's fetch (another port) is same-site and carries an Origin.
        status, headers, _ = self._request('GET', '/history/price', {
            'Host': f'node.example:{self.port}', 'Origin': DASHBOARD,
            'Sec-Fetch-Site': 'same-site'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), DASHBOARD)
        for referer in (f'{DASHBOARD}/', f'{DASHBOARD}/index.html?x=1', 'HTTP://Node.Example:3001/'):
            with self.subTest(referer=referer):
                status, _, _ = self._request('GET', '/history/price', {
                    'Host': f'127.0.0.1:{self.port}', 'Referer': referer,
                    'Sec-Fetch-Site': 'same-site'})
                self.assertEqual(status, 200)

    def test_other_site_referer_refused(self):
        # Another site, or the dashboard's host on a port that is not allowed.
        for referer in ('https://other.example/page.html', 'http://node.example:9999/'):
            for site in ('cross-site', None):
                for method in ('GET', 'OPTIONS'):
                    with self.subTest(referer=referer, site=site, method=method):
                        headers = {'Host': f'127.0.0.1:{self.port}', 'Referer': referer}
                        if site:
                            headers['Sec-Fetch-Site'] = site
                        status, resp_headers, body = self._request(
                            method, '/history/price', headers)
                        self.assertEqual(status, 403)
                        self.assertEqual(body, b'Forbidden: origin not allowed')
                        self.assertIsNone(resp_headers.get('Access-Control-Allow-Origin'))

    def test_malformed_referer_refused(self):
        for referer in ('http://[', 'not a url', '/index.html', 'http://'):
            with self.subTest(referer=referer):
                status, _, body = self._request('GET', '/history/price', {
                    'Host': f'127.0.0.1:{self.port}', 'Referer': referer})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: malformed origin')

    def test_origin_takes_precedence_over_referer(self):
        # As in bitaxe_api, a present Origin is what counts; the Referer is not checked.
        status, _, _ = self._request('GET', '/history/price', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': DASHBOARD,
            'Referer': 'https://other.example/'})
        self.assertEqual(status, 200)
        status, _, body = self._request('GET', '/history/price', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'https://other.example',
            'Referer': f'{DASHBOARD}/'})
        self.assertEqual(status, 403)
        self.assertEqual(body, b'Forbidden: origin not allowed')

    def test_other_origin_refused(self):
        for origin in ('https://other.example', 'http://localhost:3000'):  # not in this allowlist
            for method in ('GET', 'OPTIONS'):
                with self.subTest(origin=origin, method=method):
                    status, headers, body = self._request(method, '/history/price', {
                        'Host': f'127.0.0.1:{self.port}', 'Origin': origin})
                    self.assertEqual(status, 403)
                    self.assertEqual(body, b'Forbidden: origin not allowed')
                    self.assertIsNone(headers.get('Access-Control-Allow-Origin'))

    def test_malformed_origin_refused(self):
        for origin in ('null', 'http://[', 'http://'):
            with self.subTest(origin=origin):
                status, _, body = self._request('GET', '/history/price', {
                    'Host': f'127.0.0.1:{self.port}', 'Origin': origin})
                self.assertEqual(status, 403)
                self.assertEqual(body, b'Forbidden: malformed origin')

    def test_mixed_case_origin_matched_and_echoed_normalised(self):
        status, headers, _ = self._request('GET', '/history/price', {
            'Host': f'127.0.0.1:{self.port}', 'Origin': 'HTTP://Node.Example:3001'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), DASHBOARD)

    def test_vary_origin_on_every_answered_response(self):
        for method, path, expected in (('GET', '/history/price', 200),
                                       ('GET', '/history/nope', 404),
                                       ('OPTIONS', '/history/price', 204)):
            for origin in (DASHBOARD, None):
                with self.subTest(method=method, path=path, origin=origin):
                    headers = {'Host': f'127.0.0.1:{self.port}'}
                    if origin:
                        headers['Origin'] = origin
                    status, resp_headers, _ = self._request(method, path, headers)
                    self.assertEqual(status, expected)
                    self.assertEqual(resp_headers.get('Vary'), 'Origin')


if __name__ == '__main__':
    unittest.main()
