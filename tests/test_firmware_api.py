import io
import json
import os
import sys
import unittest
import urllib.error
from unittest import mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bitaxe_api


def _resp(payload):
    body = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
    cm = mock.MagicMock()
    cm.__enter__.return_value = io.BytesIO(body)
    cm.__exit__.return_value = False
    return cm


class LatestFirmwareTests(unittest.TestCase):
    def setUp(self):
        bitaxe_api._firmware_cache.update(latest=None, next_check=None)

    def _fetch(self, now, side_effect):
        with mock.patch.object(bitaxe_api.urllib.request, 'urlopen', side_effect=side_effect) as m:
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


if __name__ == '__main__':
    unittest.main()
