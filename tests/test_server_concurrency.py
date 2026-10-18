"""One slow or idle connection must not stall every other request to bitaxe_api.py.

The server is built from bitaxe_api.SERVER_CLASS, the class __main__ serves with, so
these tests fail if it goes back to a single-threaded HTTPServer: there, a request
blocked on an upstream (a miner, a feed) or a connection that never sends a request
line (a browser's idle preconnect socket) holds the accept loop, and every other
request queues behind it.

Requests here go through http.client, not urllib, because one case patches
urllib.request.urlopen.
"""
import http.client
import socket
import sys
import threading
import time
import unittest
import unittest.mock
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import bitaxe_api  # noqa: E402

# How long the fast request may take. Generous for a slow CI runner, and far below
# the time the blocked request is held (until the test releases it).
FAST = 2


class ServerConcurrencyTest(unittest.TestCase):
    def setUp(self):
        self._saved_ips = list(bitaxe_api.BITAXE_IPS)
        self._saved_origins = bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []
        bitaxe_api.BITAXE_IPS[:] = []
        self._saved_rss = dict(bitaxe_api._rss_cache)
        bitaxe_api._rss_cache.clear()
        self.server = bitaxe_api.SERVER_CLASS(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
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

    def tearDown(self):
        bitaxe_api.BITAXE_IPS[:] = self._saved_ips
        bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = self._saved_origins
        bitaxe_api._rss_cache.clear()
        bitaxe_api._rss_cache.update(self._saved_rss)

    def _get(self, path, timeout=FAST):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=timeout)
        try:
            conn.request('GET', path)
            resp = conn.getresponse()
            return resp.status, resp.read()
        finally:
            conn.close()

    def _hold(self, *_args, **_kwargs):
        """Stand-in for an upstream call: signal that a handler is inside it, then
        block until the test releases it."""
        self.started.set()
        self.release.wait(10)
        raise OSError('released by test')

    def _start_blocked(self, path):
        """Send `path` on a background thread and return once its handler is blocked
        in _hold, so the fast request below cannot win a race to the server."""
        done = {}

        def run():
            try:
                done['result'] = self._get(path, timeout=15)
            except Exception as e:  # reported by the assertion, not swallowed
                done['result'] = e

        t = threading.Thread(target=run, daemon=True)
        t.start()
        self.assertTrue(self.started.wait(5), f'{path} never reached the upstream call')
        return t, done

    def test_miners_answers_while_a_feed_fetch_is_blocked(self):
        with unittest.mock.patch.object(bitaxe_api, '_fetch_feed', self._hold):
            t, done = self._start_blocked('/api/rss?feed=optech')
            status, body = self._get('/api/miners')
            self.assertEqual(status, 200)
            self.assertIn(b'"miners"', body)
            self.assertNotIn('result', done, 'the blocked request finished before release')
            self.release.set()
            t.join(5)
        # The blocked request still completes once released (a failed fetch is a 502).
        self.assertEqual(done['result'][0], 502)

    def test_setup_answers_while_a_miner_fetch_is_blocked(self):
        bitaxe_api.BITAXE_IPS[:] = ['127.0.0.1']
        with unittest.mock.patch.object(bitaxe_api.urllib.request, 'urlopen', self._hold):
            t, done = self._start_blocked('/api/miners')
            status, _ = self._get('/api/setup')
            self.assertEqual(status, 200)
            self.assertNotIn('result', done, 'the blocked request finished before release')
            self.release.set()
            t.join(5)
        status, body = done['result']
        self.assertEqual(status, 200)
        self.assertIn(b'"online": false', body)

    def test_a_failed_fetch_does_not_discard_a_concurrent_success(self):
        # Two requests miss the same cold feed at once: the first fetch hangs and then
        # fails, the second succeeds meanwhile. The failure must keep the good copy,
        # not overwrite it with the empty cache entry it saw when it started.
        calls = []

        def fetch(_target):
            calls.append(1)
            if len(calls) == 1:
                self._hold()
            return b'<rss/>'

        with unittest.mock.patch.object(bitaxe_api, '_fetch_feed', fetch):
            t, done = self._start_blocked('/api/rss?feed=optech')
            status, body = self._get('/api/rss?feed=optech')
            self.assertEqual((status, body), (200, b'<rss/>'))
            self.release.set()
            t.join(5)
            # The released request serves the copy the other request just cached.
            self.assertEqual(done['result'], (200, b'<rss/>'))
            self.assertEqual(self._get('/api/rss?feed=optech'), (200, b'<rss/>'))
        self.assertEqual(len(calls), 2)

    def test_an_idle_connection_does_not_block_the_next_request(self):
        # A browser preconnect: accepted, then nothing is ever sent on it.
        idle = socket.create_connection(('127.0.0.1', self.port), timeout=5)
        self.addCleanup(idle.close)
        status, _ = self._get('/api/setup')
        self.assertEqual(status, 200)

    # The handler's socket timeout closes a connection that never sends a request, so
    # an idle preconnect (or a silent peer on the LAN) can't pin a thread forever. It
    # bounds reads from and writes to the client, not time spent in upstream calls.

    def _short_timeout(self):
        # setup() reads the class attribute per accepted connection, so patching it
        # after the server started applies to every connection the test then opens.
        patcher = unittest.mock.patch.object(bitaxe_api.BitaxeAPIHandler, 'timeout', 1)
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_the_handler_ships_a_finite_timeout(self):
        # The patched cases below would pass on the stdlib default (None) as well, since
        # the patch supplies the timeout; this pins that the server sets one itself.
        shipped = bitaxe_api.BitaxeAPIHandler.timeout
        self.assertIsInstance(shipped, (int, float))
        self.assertGreater(shipped, 0)
        self.assertEqual(shipped, bitaxe_api.REQUEST_TIMEOUT)

    def test_the_server_closes_an_idle_connection(self):
        self._short_timeout()
        idle = socket.create_connection(('127.0.0.1', self.port), timeout=5)
        self.addCleanup(idle.close)
        try:
            self.assertEqual(idle.recv(1), b'')
        except TimeoutError:
            self.fail('the server left an idle connection open')

    def test_a_feed_fetch_may_outlast_the_timeout(self):
        self._short_timeout()

        def slow_fetch(_target):
            time.sleep(2)
            return b'<rss/>'

        with unittest.mock.patch.object(bitaxe_api, '_fetch_feed', slow_fetch):
            self.assertEqual(self._get('/api/rss?feed=optech', timeout=15), (200, b'<rss/>'))

    def test_a_miner_fetch_may_outlast_the_timeout(self):
        self._short_timeout()

        class Resp:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            def read(self):
                return b'{"hashRate": 1}'

        def slow_urlopen(*_args, **_kwargs):
            time.sleep(2)
            return Resp()

        bitaxe_api.BITAXE_IPS[:] = ['127.0.0.1']
        with unittest.mock.patch.object(bitaxe_api.urllib.request, 'urlopen', slow_urlopen):
            status, body = self._get('/api/miners', timeout=15)
        self.assertEqual(status, 200)
        self.assertIn(b'"online": true', body)

if __name__ == '__main__':
    unittest.main()
