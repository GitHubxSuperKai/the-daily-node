import io
import json
import os
import sys
import threading
import unittest
import unittest.mock
import urllib.error
import urllib.request
from http.server import HTTPServer

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bitaxe_api


def _resp(payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    cm = unittest.mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(body)
    cm.__exit__.return_value = False
    return cm


class LatestFirmwareTests(unittest.TestCase):
    def setUp(self):
        bitaxe_api._firmware_cache.update(latest=None, next_check=None)

    def _fetch(self, now, side_effect):
        with unittest.mock.patch.object(bitaxe_api.urllib.request, 'urlopen', side_effect=side_effect) as m:
            return bitaxe_api.latest_firmware(now=now), m

    def test_fetches_the_latest_release_tag(self):
        latest, m = self._fetch(1000.0, [_resp({'tag_name': 'v2.15.3'})])
        self.assertEqual(latest, 'v2.15.3')
        req = m.call_args[0][0]
        self.assertEqual(req.full_url, bitaxe_api.FIRMWARE_RELEASE_URL)
        self.assertTrue(req.get_header('User-agent'))

    def test_serves_from_cache_within_ttl(self):
        self._fetch(1000.0, [_resp({'tag_name': 'v2.15.3'})])
        latest, m = self._fetch(1000.0 + bitaxe_api.FIRMWARE_TTL - 1, AssertionError('refetched'))
        self.assertEqual(latest, 'v2.15.3')
        m.assert_not_called()

    def test_refetches_after_ttl(self):
        self._fetch(1000.0, [_resp({'tag_name': 'v2.15.3'})])
        latest, m = self._fetch(1000.0 + bitaxe_api.FIRMWARE_TTL, [_resp({'tag_name': 'v2.16.0'})])
        self.assertEqual(latest, 'v2.16.0')
        m.assert_called_once()

    def test_failure_with_no_cache_returns_none(self):
        latest, _ = self._fetch(1000.0, urllib.error.URLError('offline'))
        self.assertIsNone(latest)

    def test_failure_serves_the_stale_value(self):
        self._fetch(1000.0, [_resp({'tag_name': 'v2.15.3'})])
        err = urllib.error.HTTPError(bitaxe_api.FIRMWARE_RELEASE_URL, 403, 'rate limited', {}, None)
        latest, _ = self._fetch(1000.0 + bitaxe_api.FIRMWARE_TTL, err)
        self.assertEqual(latest, 'v2.15.3')

    def test_failure_backs_off_before_retrying(self):
        self._fetch(1000.0, urllib.error.URLError('offline'))
        _, m = self._fetch(1000.0 + bitaxe_api.FIRMWARE_RETRY - 1, AssertionError('retried early'))
        m.assert_not_called()
        latest, m = self._fetch(1000.0 + bitaxe_api.FIRMWARE_RETRY, [_resp({'tag_name': 'v2.15.3'})])
        self.assertEqual(latest, 'v2.15.3')

    def test_rejects_a_tag_that_is_not_a_version(self):
        for bad in ({'tag_name': '<script>'}, {'tag_name': 7}, {}, [], b'not json'):
            bitaxe_api._firmware_cache.update(latest=None, next_check=None)
            latest, _ = self._fetch(1000.0, [_resp(bad)])
            self.assertIsNone(latest, bad)


class ConcurrentLookupTests(unittest.TestCase):
    """The server is threaded, so latest_firmware() can run on several threads at once."""

    def setUp(self):
        bitaxe_api._firmware_cache.update(latest='v2.15.2', next_check=None)

    def test_concurrent_callers_share_one_github_request(self):
        release = threading.Event()
        entered = threading.Event()
        calls = []

        def slow_urlopen(*_a, **_k):
            calls.append(1)
            entered.set()
            release.wait(5)
            return _resp({'tag_name': 'v2.15.3'})

        results = []
        with unittest.mock.patch.object(bitaxe_api.urllib.request, 'urlopen', side_effect=slow_urlopen):
            first = threading.Thread(target=lambda: results.append(bitaxe_api.latest_firmware(now=1000.0)))
            first.start()
            self.assertTrue(entered.wait(5))
            # A second caller while the first is still waiting on GitHub gets the
            # cached tag at once instead of starting its own request.
            second = bitaxe_api.latest_firmware(now=1000.0)
            release.set()
            first.join(5)
        self.assertEqual(len(calls), 1)
        self.assertEqual(second, 'v2.15.2')
        self.assertEqual(results, ['v2.15.3'])


class FirmwareRouteTests(unittest.TestCase):
    """GET /api/firmware is wired to latest_firmware() and sits behind the origin gate."""

    @classmethod
    def setUpClass(cls):
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = ['http://localhost:3000']
        cls.server = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def _get(self, origin):
        req = urllib.request.Request(f'http://127.0.0.1:{self.port}/api/firmware', headers={'Origin': origin})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_serves_latest_as_json(self):
        with unittest.mock.patch.object(bitaxe_api, 'latest_firmware', return_value='v2.15.3'):
            status, body = self._get('http://localhost:3000')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'latest': 'v2.15.3'})

    def test_serves_null_when_unknown(self):
        with unittest.mock.patch.object(bitaxe_api, 'latest_firmware', return_value=None):
            status, body = self._get('http://localhost:3000')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body), {'latest': None})

    def test_rejects_a_disallowed_origin_without_fetching(self):
        with unittest.mock.patch.object(bitaxe_api, 'latest_firmware', return_value='v2.15.3') as m:
            status, _ = self._get('https://evil.example')
        self.assertEqual(status, 403)
        m.assert_not_called()


if __name__ == '__main__':
    unittest.main()
