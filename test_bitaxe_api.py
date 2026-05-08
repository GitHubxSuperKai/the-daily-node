import json
import os
import tempfile
import unittest
from unittest.mock import patch

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


if __name__ == '__main__':
    unittest.main()
