"""Tests that CORS headers appear on error responses from bitaxe_api and history_daemon.

Without CORS headers on error responses, cross-origin clients (the dashboard on a
different port) receive an opaque network failure instead of a readable error body.
"""
import os
import sqlite3
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import bitaxe_api  # noqa: E402
from history_daemon import HistoryHandler, ensure_schema  # noqa: E402

# 127.0.0.1 is a loopback IP — passes bitaxe_api.is_private_ip() unconditionally.
BITAXE_ORIGIN = 'http://127.0.0.1:3000'
# Must be an exact entry in history_daemon._ALLOWED_ORIGINS (string match, not IP check).
HISTORY_ORIGIN = 'http://localhost:3000'


def _get(port, path, origin=None):
    """GET request that returns (status, headers) for both 2xx and error responses."""
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}')
    if origin:
        req.add_header('Origin', origin)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.headers


class BitaxeCatchAll404CORSTest(unittest.TestCase):
    """GET on an unknown route must include CORS headers so the browser can read the 404."""

    @classmethod
    def setUpClass(cls):
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []  # [] => no-Origin bypasses check
        cls.server = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_unknown_route_404_includes_cors_header(self):
        status, headers = _get(self.port, '/api/nonexistent-route', origin=BITAXE_ORIGIN)
        self.assertEqual(status, 404)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), BITAXE_ORIGIN)


class HistoryDaemonErrorCORSTest(unittest.TestCase):
    """404 (bad route) and 500 (DB error) in history_daemon must carry CORS headers."""

    @classmethod
    def setUpClass(cls):
        cls._tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(cls._tmpdir, 'test.db')
        conn = sqlite3.connect(db_path)
        ensure_schema(conn)
        conn.close()
        HistoryHandler.db_path = db_path

        cls.server = HTTPServer(('127.0.0.1', 0), HistoryHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        import shutil
        shutil.rmtree(cls._tmpdir, ignore_errors=True)

    def test_bad_route_404_includes_cors_header(self):
        status, headers = _get(self.port, '/bad/route', origin=HISTORY_ORIGIN)
        self.assertEqual(status, 404)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), HISTORY_ORIGIN)

    def test_db_error_500_includes_cors_header(self):
        """A non-sqlite3 file triggers DatabaseError on execute, which must 500 with CORS."""
        bad_db = os.path.join(self._tmpdir, 'notadb.txt')
        with open(bad_db, 'w') as f:
            f.write('not a sqlite3 database')
        original = HistoryHandler.db_path
        HistoryHandler.db_path = bad_db
        try:
            status, headers = _get(self.port, '/history/price', origin=HISTORY_ORIGIN)
            self.assertEqual(status, 500)
            self.assertEqual(headers.get('Access-Control-Allow-Origin'), HISTORY_ORIGIN)
        finally:
            HistoryHandler.db_path = original


if __name__ == '__main__':
    unittest.main()
