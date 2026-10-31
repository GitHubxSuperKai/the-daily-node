import os
import sys
import tempfile
import threading
import unittest
import unittest.mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bitaxe_api


class ConfigIOTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        self.tmp.close()
        os.unlink(self.tmp.name)  # path exists but file does not yet
        self.path = self.tmp.name

    def tearDown(self):
        if os.path.exists(self.path):
            os.unlink(self.path)

    def test_load_missing_returns_empty_list(self):
        self.assertEqual(bitaxe_api.load_config(self.path), [])

    def test_save_then_load_roundtrip(self):
        bitaxe_api.save_config(self.path, ['127.0.0.1', '::1'])
        self.assertEqual(
            bitaxe_api.load_config(self.path),
            ['127.0.0.1', '::1'],
        )

    def test_load_corrupt_json_returns_empty_list(self):
        with open(self.path, 'w') as f:
            f.write('{not json')
        self.assertEqual(bitaxe_api.load_config(self.path), [])


class ValidateIPsTests(unittest.TestCase):
    def test_accepts_valid_private_ips(self):
        ok, errors = bitaxe_api.validate_ips(['192.168.1.10', '10.0.0.5'])
        self.assertEqual(ok, ['192.168.1.10', '10.0.0.5'])
        self.assertEqual(errors, [])

    def test_rejects_malformed(self):
        ok, errors = bitaxe_api.validate_ips(['not-an-ip', '999.999.0.0'])
        self.assertEqual(ok, [])
        self.assertEqual(len(errors), 2)

    def test_strips_whitespace_and_skips_blank(self):
        ok, errors = bitaxe_api.validate_ips(['  192.168.1.10  ', '', '   '])
        self.assertEqual(ok, ['192.168.1.10'])
        self.assertEqual(errors, [])

    def test_dedupes(self):
        ok, errors = bitaxe_api.validate_ips(['192.168.1.10', '192.168.1.10'])
        self.assertEqual(ok, ['192.168.1.10'])
        self.assertEqual(errors, [])

    def test_rejects_public_ip(self):
        ok, errors = bitaxe_api.validate_ips(['8.8.8.8'])
        self.assertEqual(ok, [])
        self.assertEqual(len(errors), 1)


class FetchAllMinersTests(unittest.TestCase):
    def setUp(self):
        self._saved_ips = list(bitaxe_api.BITAXE_IPS)
        self.release = threading.Event()
        self.addCleanup(self.release.set)  # let the stuck worker thread finish

    def tearDown(self):
        bitaxe_api.BITAXE_IPS[:] = self._saved_ips

    def test_a_miner_still_fetching_after_the_join_is_reported_offline(self):
        # urlopen's timeout bounds each socket operation, not the whole fetch, so a
        # worker can outlast the join. It must come back offline, not go missing.
        bitaxe_api.BITAXE_IPS[:] = ['10.0.0.1', '10.0.0.2', '10.0.0.3']

        def fetch(ip):
            if ip == '10.0.0.2':
                self.release.wait(10)
            return {'ip': ip, 'online': True, 'data': {}}

        with unittest.mock.patch.object(bitaxe_api, 'fetch_miner', fetch), \
                unittest.mock.patch.object(bitaxe_api, 'FETCH_TIMEOUT', -0.9):  # join waits 0.1s
            miners = bitaxe_api.fetch_all_miners()

        self.assertEqual([m['ip'] for m in miners], ['10.0.0.1', '10.0.0.2', '10.0.0.3'])
        self.assertEqual(miners[1], {'ip': '10.0.0.2', 'online': False, 'error': 'timed out'})
        self.assertTrue(miners[0]['online'])
        self.assertTrue(miners[2]['online'])


if __name__ == '__main__':
    unittest.main()
