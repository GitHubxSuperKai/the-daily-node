import unittest
import sqlite3
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from history_daemon import ensure_schema, parse_price_response, parse_chain_response, purge_old, poll_purge


class TestSchema(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        ensure_schema(self.db)

    def tearDown(self):
        self.db.close()

    def test_tables_created(self):
        tables = {r[0] for r in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()}
        for t in ('price', 'hashrate', 'fees', 'mempool', 'miners'):
            self.assertIn(t, tables)

    def test_price_insert_and_read(self):
        now = int(time.time())
        self.db.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (now, 'kraken', 50000.0, 100.0))
        self.db.commit()
        row = self.db.execute('SELECT usd FROM price WHERE ts=?', (now,)).fetchone()
        self.assertEqual(row[0], 50000.0)

    def test_price_upsert_on_same_ts(self):
        now = int(time.time())
        self.db.execute('INSERT OR REPLACE INTO price VALUES (?, ?, ?, ?)', (now, 'kraken', 50000.0, 100.0))
        self.db.execute('INSERT OR REPLACE INTO price VALUES (?, ?, ?, ?)', (now, 'kraken', 51000.0, 110.0))
        self.db.commit()
        count = self.db.execute('SELECT COUNT(*) FROM price WHERE ts=?', (now,)).fetchone()[0]
        self.assertEqual(count, 1)


class TestParsers(unittest.TestCase):
    def test_parse_price_response_valid(self):
        raw = {'result': {'XXBTZUSD': {'c': ['50000.0', ''], 'v': ['100.0', '200.0']}}}
        result = parse_price_response(raw)
        self.assertAlmostEqual(result['usd'], 50000.0)
        self.assertAlmostEqual(result['vol'], 200.0)

    def test_parse_price_response_missing_key(self):
        self.assertIsNone(parse_price_response({'result': {}}))

    def test_parse_price_response_malformed(self):
        self.assertIsNone(parse_price_response({}))

    def test_parse_chain_response_valid(self):
        fees = {'fastestFee': 30, 'halfHourFee': 20, 'economyFee': 5}
        mempool = {'vsize': 1_000_000, 'count': 5000}
        hashrate = {'currentHashrate': 500e18}
        result = parse_chain_response(fees, mempool, hashrate)
        self.assertEqual(result['fast'], 30)
        self.assertEqual(result['half'], 20)
        self.assertEqual(result['eco'], 5)
        self.assertEqual(result['vsize'], 1_000_000)
        self.assertAlmostEqual(result['ehs'], 500.0)

    def test_parse_chain_response_missing_key(self):
        self.assertIsNone(parse_chain_response({}, {}, {}))


class TestPurge(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        ensure_schema(self.db)

    def tearDown(self):
        self.db.close()

    def test_purges_rows_older_than_90_days(self):
        old = int(time.time()) - 91 * 86400
        now = int(time.time())
        self.db.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (old, 'kraken', 1000.0, 1.0))
        self.db.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (now, 'kraken', 50000.0, 100.0))
        self.db.commit()
        purge_old(self.db, days=90)
        count = self.db.execute('SELECT COUNT(*) FROM price').fetchone()[0]
        self.assertEqual(count, 1)

    def test_keeps_rows_within_90_days(self):
        ts = int(time.time()) - 89 * 86400
        self.db.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (ts, 'kraken', 50000.0, 100.0))
        self.db.commit()
        purge_old(self.db, days=90)
        count = self.db.execute('SELECT COUNT(*) FROM price').fetchone()[0]
        self.assertEqual(count, 1)


class TestPollPurge(unittest.TestCase):
    def test_poll_purge_removes_old_rows(self):
        import tempfile
        old = int(time.time()) - 91 * 86400
        now = int(time.time())
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            tmp_db = f.name
        try:
            conn2 = sqlite3.connect(tmp_db)
            ensure_schema(conn2)
            conn2.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (old, 'kraken', 1000.0, 1.0))
            conn2.execute('INSERT INTO price VALUES (?, ?, ?, ?)', (now, 'kraken', 50000.0, 100.0))
            conn2.commit()
            conn2.close()
            poll_purge(tmp_db)
            conn3 = sqlite3.connect(tmp_db)
            count = conn3.execute('SELECT COUNT(*) FROM price').fetchone()[0]
            conn3.close()
            self.assertEqual(count, 1)
        finally:
            os.unlink(tmp_db)


if __name__ == '__main__':
    unittest.main()
