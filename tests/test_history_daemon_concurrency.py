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
import time
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

        # history_daemon.sqlite3 IS the sqlite3 module, so this patches connect for the
        # whole process, not only the daemon; nothing else opens a connection meanwhile.
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

    # The handler's socket timeout closes a connection that never sends a request, so
    # an idle preconnect (or a silent peer on the LAN) can't pin a thread forever. It
    # bounds reads from and writes to the client, not time spent in a query.

    def _short_timeout(self):
        # setup() reads the class attribute per accepted connection, so patching it
        # after the server started applies to every connection the test then opens.
        patcher = unittest.mock.patch.object(history_daemon.HistoryHandler, 'timeout', 1)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_handler_ships_a_finite_timeout(self):
        # The patched cases below would pass on the stdlib default (None) as well, since
        # the patch supplies the timeout; this pins that the server sets one itself.
        shipped = history_daemon.HistoryHandler.timeout
        self.assertIsInstance(shipped, (int, float))
        self.assertGreater(shipped, 0)
        self.assertEqual(shipped, history_daemon.REQUEST_TIMEOUT)

    def test_the_server_closes_an_idle_connection(self):
        self._short_timeout()
        idle = socket.create_connection(('127.0.0.1', self.port), timeout=5)
        self.addCleanup(idle.close)
        try:
            self.assertEqual(idle.recv(1), b'')
        except TimeoutError:
            self.fail('the server left an idle connection open')

    def test_a_query_may_outlast_the_timeout(self):
        self._short_timeout()
        real_connect = sqlite3.connect

        def slow_connect(path, *args, **kwargs):
            time.sleep(2)
            return real_connect(path, *args, **kwargs)

        # Process-wide patch, as in the blocked-query case above.
        with unittest.mock.patch.object(history_daemon.sqlite3, 'connect', slow_connect):
            self.assertEqual(self._get('/history/price', timeout=15), (200, b'[]'))


if __name__ == '__main__':
    unittest.main()
