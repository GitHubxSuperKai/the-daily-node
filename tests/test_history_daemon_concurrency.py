"""One slow or idle connection must not stall every other request to history_daemon.py.

The server is built from history_daemon.SERVER_CLASS, the class main() serves with, so
these tests fail if it goes back to a single-threaded HTTPServer: there, a request
stuck in its SQLite query or a connection that never sends a request line (a browser's
idle preconnect socket) holds the accept loop, and every other request queues behind it.
"""
import http.client
import os
import shutil
import socket
import sqlite3
import sys
import tempfile
import threading
import unittest
import unittest.mock
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import history_daemon  # noqa: E402

# How long the fast request may take. Generous for a slow CI runner, and far below
# the time the blocked request is held (until the test releases it).
FAST = 2


class HistoryDaemonConcurrencyTest(unittest.TestCase):
    def setUp(self):
        tmpdir = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmpdir, ignore_errors=True)
        self.db_path = os.path.join(tmpdir, 'history.db')
        conn = sqlite3.connect(self.db_path)
        history_daemon.ensure_schema(conn)
        conn.close()
        saved = history_daemon.HistoryHandler.db_path
        self.addCleanup(setattr, history_daemon.HistoryHandler, 'db_path', saved)
        history_daemon.HistoryHandler.db_path = self.db_path
        self.server = history_daemon.SERVER_CLASS(('127.0.0.1', 0), history_daemon.HistoryHandler)
        self.port = self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        # Cleanups run last-registered first: anything a test registers later (releasing
        # a blocked handler, closing an idle socket) runs before this shutdown, which
        # would otherwise wait on a single-threaded server's stuck handler.
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.started = threading.Event()
        self.release = threading.Event()
        self.addCleanup(self.release.set)

    def _get(self, path, timeout=FAST):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=timeout)
        try:
            conn.request('GET', path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def test_a_request_answers_while_another_query_is_blocked(self):
        real_connect = sqlite3.connect

        def connect(path, *args, **kwargs):
            # Hold only the first request's query; later ones run normally.
            if not self.started.is_set():
                self.started.set()
                self.release.wait(10)
            return real_connect(path, *args, **kwargs)

        done = {}

        def run():
            try:
                done['result'] = self._get('/history/price', timeout=15)
            except Exception as e:  # reported by the assertion, not swallowed
                done['result'] = e

        with unittest.mock.patch.object(history_daemon.sqlite3, 'connect', connect):
            t = threading.Thread(target=run, daemon=True)
            t.start()
            self.assertTrue(self.started.wait(5), 'the first request never reached its query')
            status, body = self._get('/history/fees')
            self.assertEqual(status, 200)
            self.assertEqual(body, b'[]')
            self.assertNotIn('result', done, 'the blocked request finished before release')
            self.release.set()
            t.join(5)
        # The blocked request still completes once released.
        self.assertEqual(done['result'], (200, b'[]'))

    def test_an_idle_connection_does_not_block_the_next_request(self):
        # A browser preconnect: accepted, then nothing is ever sent on it.
        idle = socket.create_connection(('127.0.0.1', self.port), timeout=5)
        self.addCleanup(idle.close)
        status, _ = self._get('/history/price')
        self.assertEqual(status, 200)


if __name__ == '__main__':
    unittest.main()
