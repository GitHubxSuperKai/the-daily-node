#!/usr/bin/env python3
"""The Daily Node — History Daemon

Polls upstream APIs, writes time-series to SQLite, serves HTTP read API on 127.0.0.1:3002.

Usage:
    python history_daemon.py [--db PATH] [--bind HOST] [--port PORT] [--bitaxe-ip IP ...]
"""
import argparse
import json
import os
import sqlite3
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

DEFAULT_DB     = os.path.expanduser('~/.daily-node/history.db')
POLL_PRICE_S   = 30
POLL_CHAIN_S   = 60
POLL_MINER_S   = 30
PURGE_INTERVAL_S = 86400
RETENTION_DAYS = 90


# ─── Schema ────────────────────────────────────────────────────

def ensure_schema(conn):
    conn.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS price (
            ts      INTEGER PRIMARY KEY,
            source  TEXT    NOT NULL,
            usd     REAL    NOT NULL,
            vol     REAL    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hashrate (
            ts  INTEGER PRIMARY KEY,
            ehs REAL    NOT NULL
        );
        CREATE TABLE IF NOT EXISTS fees (
            ts   INTEGER PRIMARY KEY,
            fast INTEGER NOT NULL,
            half INTEGER NOT NULL,
            eco  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS mempool (
            ts    INTEGER PRIMARY KEY,
            vsize INTEGER NOT NULL,
            count INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS miners (
            ts       INTEGER NOT NULL,
            ip       TEXT    NOT NULL,
            hashrate REAL    NOT NULL,
            temp     REAL    NOT NULL,
            shares   INTEGER NOT NULL,
            PRIMARY KEY (ts, ip)
        );
    """)
    conn.commit()


# ─── Parsers ───────────────────────────────────────────────────

def parse_price_response(raw):
    """Parse Kraken Ticker response. Returns dict or None on error."""
    try:
        ticker = raw['result']['XXBTZUSD']
        return {'usd': float(ticker['c'][0]), 'vol': float(ticker['v'][1])}
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def parse_chain_response(fees_raw, mempool_raw, hashrate_raw):
    """Parse mempool.space fees, mempool, and hashrate into a flat dict."""
    try:
        return {
            'fast':  int(fees_raw['fastestFee']),
            'half':  int(fees_raw['halfHourFee']),
            'eco':   int(fees_raw['economyFee']),
            'vsize': int(mempool_raw['vsize']),
            'count': int(mempool_raw['count']),
            'ehs':   float(hashrate_raw.get('currentHashrate', 0)) / 1e18,
        }
    except (KeyError, TypeError, ValueError):
        return None


# ─── Purge ─────────────────────────────────────────────────────

def purge_old(conn, days=RETENTION_DAYS):
    cutoff = int(time.time()) - days * 86400
    for table in ('price', 'hashrate', 'fees', 'mempool', 'miners'):
        conn.execute(f'DELETE FROM {table} WHERE ts < ?', (cutoff,))
    conn.commit()


def poll_purge(db_path):
    try:
        conn = sqlite3.connect(db_path)
        try:
            purge_old(conn)
        finally:
            conn.close()
    except Exception as e:
        print(f'[purge] error: {e}', file=sys.stderr)


# ─── HTTP fetch helper ─────────────────────────────────────────

def fetch_json(url, timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent': 'daily-node/2.0'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())


# ─── Poll functions ────────────────────────────────────────────

def poll_price(db_path):
    try:
        raw    = fetch_json('https://api.kraken.com/0/public/Ticker?pair=XBTUSD')
        parsed = parse_price_response(raw)
        if parsed is None:
            return
        ts   = int(time.time())
        conn = sqlite3.connect(db_path)
        try:
            conn.execute('INSERT OR REPLACE INTO price VALUES (?, ?, ?, ?)',
                         (ts, 'kraken', parsed['usd'], parsed['vol']))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f'[price] poll error: {e}', file=sys.stderr)


def poll_chain(db_path):
    try:
        fees_raw     = fetch_json('https://mempool.space/api/v1/fees/recommended')
        mempool_raw  = fetch_json('https://mempool.space/api/mempool')
        hashrate_raw = fetch_json('https://mempool.space/api/v1/mining/hashrate/3d')
        parsed = parse_chain_response(fees_raw, mempool_raw, hashrate_raw)
        if parsed is None:
            return
        ts   = int(time.time())
        conn = sqlite3.connect(db_path)
        try:
            conn.execute('INSERT OR REPLACE INTO fees    VALUES (?, ?, ?, ?)',
                         (ts, parsed['fast'], parsed['half'], parsed['eco']))
            conn.execute('INSERT OR REPLACE INTO mempool VALUES (?, ?, ?)',
                         (ts, parsed['vsize'], parsed['count']))
            conn.execute('INSERT OR REPLACE INTO hashrate VALUES (?, ?)',
                         (ts, parsed['ehs']))
            conn.commit()
        finally:
            conn.close()
    except Exception as e:
        print(f'[chain] poll error: {e}', file=sys.stderr)


def poll_miners(db_path, ips):
    if not ips:
        return
    ts   = int(time.time())
    conn = sqlite3.connect(db_path)
    try:
        for ip in ips:
            try:
                raw      = fetch_json(f'http://{ip}/api/system/info', timeout=5)
                hashrate = float(raw.get('hashRate', 0))
                temp     = float(raw.get('temp', 0))
                shares   = int(raw.get('sharesAccepted', 0))
                conn.execute('INSERT OR REPLACE INTO miners VALUES (?, ?, ?, ?, ?)',
                             (ts, ip, hashrate, temp, shares))
            except Exception as e:
                print(f'[miners] {ip} error: {e}', file=sys.stderr)
        conn.commit()
    finally:
        conn.close()


# ─── Background polling ────────────────────────────────────────

def poll_forever(fn, interval_s):
    while True:
        fn()
        time.sleep(interval_s)


# ─── HTTP read API ─────────────────────────────────────────────

def _build_metric_queries():
    _templates = {
        'price':    'SELECT (ts/{d})*{d} AS ts, AVG(usd) AS usd, AVG(vol) AS vol '
                    'FROM price WHERE ts>=? AND ts<=? GROUP BY (ts/{d}) ORDER BY ts',
        'hashrate': 'SELECT (ts/{d})*{d} AS ts, AVG(ehs) AS ehs '
                    'FROM hashrate WHERE ts>=? AND ts<=? GROUP BY (ts/{d}) ORDER BY ts',
        'fees':     'SELECT (ts/{d})*{d} AS ts, AVG(fast) AS fast, AVG(half) AS half, AVG(eco) AS eco '
                    'FROM fees WHERE ts>=? AND ts<=? GROUP BY (ts/{d}) ORDER BY ts',
        'mempool':  'SELECT (ts/{d})*{d} AS ts, AVG(vsize) AS vsize, AVG(count) AS count '
                    'FROM mempool WHERE ts>=? AND ts<=? GROUP BY (ts/{d}) ORDER BY ts',
    }
    _divisors = {'min': 60, 'hour': 3600, 'day': 86400}
    return {
        metric: {bucket: tmpl.replace('{d}', str(d)) for bucket, d in _divisors.items()}
        for metric, tmpl in _templates.items()
    }

METRIC_QUERIES = _build_metric_queries()

_ALLOWED_ORIGINS = {
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
}


class HistoryHandler(BaseHTTPRequestHandler):
    db_path = None

    def log_message(self, fmt, *args):
        pass  # silence default access log

    def _send_cors(self):
        origin = self.headers.get('Origin', '')
        if origin in _ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)

    def do_OPTIONS(self):
        self.send_response(204)
        self._send_cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        parts  = parsed.path.strip('/').split('/')

        if len(parts) != 2 or parts[0] != 'history' or parts[1] not in METRIC_QUERIES:
            self.send_response(404)
            self.end_headers()
            return

        metric  = parts[1]
        params  = parse_qs(parsed.query)
        now     = int(time.time())
        ts_from = int(params.get('from', [now - 86400])[0])
        ts_to   = int(params.get('to',   [now])[0])
        bucket = params.get('bucket', ['min'])[0]
        if bucket not in ('min', 'hour', 'day'):
            bucket = 'min'

        sql = METRIC_QUERIES[metric][bucket]
        try:
            conn             = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            rows             = conn.execute(sql, (ts_from, ts_to)).fetchall()
            conn.close()
            data = [dict(r) for r in rows]
        except Exception as e:
            print(f'[api] query error: {e}', file=sys.stderr)
            self.send_response(500)
            self.end_headers()
            return

        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._send_cors()
        self.end_headers()
        self.wfile.write(body)


# ─── Entry point ───────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='The Daily Node history daemon')
    parser.add_argument('--db',        default=DEFAULT_DB,    help='SQLite DB path')
    parser.add_argument('--bind',      default='127.0.0.1',   help='HTTP bind address')
    parser.add_argument('--port',      type=int, default=3002, help='HTTP port')
    parser.add_argument('--bitaxe-ip', action='append', default=[], dest='bitaxe_ips',
                        help='BitAxe miner IP (repeatable)')
    args = parser.parse_args()

    db_dir = os.path.dirname(args.db)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(args.db)
    ensure_schema(conn)
    conn.close()

    print(f'[daemon] DB:         {args.db}')
    print(f'[daemon] HTTP:       {args.bind}:{args.port}')
    print(f'[daemon] BitAxe IPs: {args.bitaxe_ips or "(none)"}')

    for fn, interval in [
        (lambda: poll_price(args.db),                    POLL_PRICE_S),
        (lambda: poll_chain(args.db),                    POLL_CHAIN_S),
        (lambda: poll_miners(args.db, args.bitaxe_ips),  POLL_MINER_S),
        (lambda: poll_purge(args.db),                    PURGE_INTERVAL_S),
    ]:
        threading.Thread(target=poll_forever, args=(fn, interval), daemon=True).start()

    HistoryHandler.db_path = args.db
    server = HTTPServer((args.bind, args.port), HistoryHandler)
    print(f'[daemon] Listening. Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('[daemon] Stopping.')


if __name__ == '__main__':
    main()
