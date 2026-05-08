import unittest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from urllib.parse import urlparse
from bitaxe_api import is_origin_allowed

class TestOriginAllowlist(unittest.TestCase):
    def test_allows_localhost(self):
        self.assertTrue(is_origin_allowed('http://localhost:3000', ['http://localhost:3000']))

    def test_allows_127_0_0_1(self):
        self.assertTrue(is_origin_allowed('http://127.0.0.1:3000', ['http://localhost:3000', 'http://127.0.0.1:3000']))

    def test_rejects_other_origin(self):
        self.assertFalse(is_origin_allowed('http://evil.example.com', ['http://localhost:3000']))

    def test_rejects_missing_origin_documents_headerless_behavior(self):
        # Requests with no Origin or Referer header produce None — must be blocked.
        # This documents the intentional policy: headerless requests are rejected.
        self.assertFalse(is_origin_allowed(None, ['http://localhost:3000']))

    def test_empty_allowlist_blocks_all(self):
        self.assertFalse(is_origin_allowed('http://localhost:3000', []))

    def test_referer_with_path_normalizes_to_origin(self):
        # Referer headers include a path (e.g. http://localhost:3000/index.html).
        # _check_origin() strips the path via urlparse before calling is_origin_allowed.
        # This test validates the normalization step matches the allowlist entry.
        referer = 'http://localhost:3000/some/deep/path?q=1'
        parsed = urlparse(referer)
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        self.assertEqual(normalized, 'http://localhost:3000')
        self.assertTrue(is_origin_allowed(normalized, ['http://localhost:3000']))

    def test_referer_with_path_different_port_rejected(self):
        # After normalization a Referer on port 9999 must not match port 3000.
        referer = 'http://localhost:9999/page'
        parsed = urlparse(referer)
        normalized = f"{parsed.scheme}://{parsed.netloc}"
        self.assertFalse(is_origin_allowed(normalized, ['http://localhost:3000']))

if __name__ == '__main__':
    unittest.main()
