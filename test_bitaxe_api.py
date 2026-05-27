import os
import tempfile
import unittest

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


if __name__ == '__main__':
    unittest.main()
