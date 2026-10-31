"""history_daemon applies the same request checks as bitaxe_api's API routes, to every
route: the Host allowlist (bitaxe_api.is_host_allowed, covered in test_request_checks.py)
and the Sec-Fetch-Site check for a request with no Origin or Referer."""
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
        for host in ('[', '[::1', f'[node.example]:{self.port}', f'[127.0.0.1]:{self.port}'):
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

    def test_cross_site_with_origin_or_referer_is_not_refused_by_this_check(self):
        # With an Origin the CORS allowlist decides; this check covers only requests
        # that name no origin at all. The dashboard's fetch (another port) is same-site.
        status, headers, _ = self._request('GET', '/history/price', {
            'Host': f'node.example:{self.port}', 'Origin': DASHBOARD,
            'Sec-Fetch-Site': 'same-site'})
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), DASHBOARD)
        status, _, _ = self._request('GET', '/history/price', {
            'Host': f'127.0.0.1:{self.port}', 'Referer': f'{DASHBOARD}/',
            'Sec-Fetch-Site': 'same-site'})
        self.assertEqual(status, 200)


if __name__ == '__main__':
    unittest.main()
