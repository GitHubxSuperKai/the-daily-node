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
from history_daemon import (  # noqa: E402
    DEFAULT_ALLOWED_ORIGINS,
    HistoryHandler,
    ensure_schema,
    resolve_allowed_origins,
)

# 127.0.0.1 is a loopback IP — passes bitaxe_api.is_private_ip() unconditionally.
BITAXE_ORIGIN = 'http://127.0.0.1:3000'
# Must be an exact entry in history_daemon.DEFAULT_ALLOWED_ORIGINS (string match, not IP check).
HISTORY_ORIGIN = 'http://localhost:3000'
# serve_forever's default 0.5s poll is what shutdown() waits out, once per server.
POLL_INTERVAL = 0.05


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
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

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
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
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


class HistoryDaemonAllowOriginTest(unittest.TestCase):
    """--allow-origin lets a deployed dashboard (served from another host:port) read the
    daemon. Without it the allowlist is localhost-only, so a dashboard on a LAN host gets
    403 origin not allowed, with no Access-Control-Allow-Origin."""

    DASHBOARD = 'http://dashboard.example:3001'

    @classmethod
    def setUpClass(cls):
        cls._tmpdir = tempfile.mkdtemp()
        db_path = os.path.join(cls._tmpdir, 'test.db')
        conn = sqlite3.connect(db_path)
        ensure_schema(conn)
        conn.close()
        cls._saved = (HistoryHandler.db_path, HistoryHandler.allowed_origins)
        HistoryHandler.db_path = db_path
        cls.server = HTTPServer(('127.0.0.1', 0), HistoryHandler)
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(
            target=cls.server.serve_forever, kwargs={'poll_interval': POLL_INTERVAL}, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        HistoryHandler.db_path, HistoryHandler.allowed_origins = cls._saved
        import shutil
        shutil.rmtree(cls._tmpdir, ignore_errors=True)

    def tearDown(self):
        HistoryHandler.allowed_origins = self._saved[1]

    def test_default_allowlist_rejects_a_lan_dashboard(self):
        status, headers = _get(self.port, '/history/price', origin=self.DASHBOARD)
        self.assertEqual(status, 403)
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'))
        status, headers = _get(self.port, '/history/price', origin=HISTORY_ORIGIN)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), HISTORY_ORIGIN)

    def test_configured_origin_is_allowed_and_replaces_the_defaults(self):
        HistoryHandler.allowed_origins = resolve_allowed_origins([self.DASHBOARD])
        status, headers = _get(self.port, '/history/price', origin=self.DASHBOARD)
        self.assertEqual(status, 200)
        self.assertEqual(headers.get('Access-Control-Allow-Origin'), self.DASHBOARD)
        status, headers = _get(self.port, '/history/price', origin=HISTORY_ORIGIN)
        self.assertEqual(status, 403)
        self.assertIsNone(headers.get('Access-Control-Allow-Origin'),
                          'an explicit --allow-origin list replaces the localhost defaults')

    def test_resolve_allowed_origins(self):
        self.assertEqual(resolve_allowed_origins(None), DEFAULT_ALLOWED_ORIGINS)
        self.assertEqual(resolve_allowed_origins([]), DEFAULT_ALLOWED_ORIGINS)
        self.assertEqual(resolve_allowed_origins([self.DASHBOARD, self.DASHBOARD]),
                         frozenset({self.DASHBOARD}))
        # Trailing slashes never appear in a browser Origin header; strip them so a
        # pasted URL still matches.
        self.assertEqual(resolve_allowed_origins([self.DASHBOARD + '/']),
                         frozenset({self.DASHBOARD}))
        # Browsers send the host lowercase; whitespace and a lone '/' are typos, never
        # an origin (an empty entry would match a request with no Origin at all).
        self.assertEqual(resolve_allowed_origins(['  HTTP://Dashboard.Example:3001 ']),
                         frozenset({self.DASHBOARD}))
        self.assertEqual(resolve_allowed_origins(['/', '   ']), DEFAULT_ALLOWED_ORIGINS)

    def test_defaults_include_the_docker_dashboard_port(self):
        # The Docker image serves the dashboard on :3001, so on the Docker host itself the
        # charts must work with no --allow-origin at all.
        for origin in ('http://localhost:3001', 'http://127.0.0.1:3001'):
            self.assertIn(origin, DEFAULT_ALLOWED_ORIGINS)


if __name__ == '__main__':
    unittest.main()
