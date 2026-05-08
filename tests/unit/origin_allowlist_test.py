import unittest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from bitaxe_api import is_origin_allowed

class TestOriginAllowlist(unittest.TestCase):
    def test_allows_localhost(self):
        self.assertTrue(is_origin_allowed('http://localhost:3000', ['http://localhost:3000']))
    def test_allows_127_0_0_1(self):
        self.assertTrue(is_origin_allowed('http://127.0.0.1:3000', ['http://localhost:3000', 'http://127.0.0.1:3000']))
    def test_rejects_other_origin(self):
        self.assertFalse(is_origin_allowed('http://evil.example.com', ['http://localhost:3000']))
    def test_rejects_missing_origin(self):
        self.assertFalse(is_origin_allowed(None, ['http://localhost:3000']))
    def test_empty_allowlist_blocks_all(self):
        self.assertFalse(is_origin_allowed('http://localhost:3000', []))

if __name__ == '__main__':
    unittest.main()
