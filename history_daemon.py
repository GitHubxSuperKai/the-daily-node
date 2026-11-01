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
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from bitaxe_api import is_host_allowed

DEFAULT_DB     = os.path.expanduser('~/.daily-node/history.db')
POLL_PRICE_S   = 30
POLL_CHAIN_S   = 60
POLL_MINER_S   = 30
PURGE_INTERVAL_S = 86400
RETENTION_DAYS = 90
# A thread per connection, so a slow query or a connection that never sends a request
# (a browser's idle preconnect) can't hold every other request. Each request opens its
# own SQLite connection, and HistoryHandler's class attributes are set once in main(),
# so nothing the handler touches is shared between threads.
# tests/test_history_daemon_concurrency.py fails on HTTPServer.
SERVER_CLASS   = ThreadingHTTPServer
# Seconds a client socket may sit silent before the handler closes it, so an idle
# preconnect, or a peer on the LAN that connects and sends nothing, frees its thread.
# It bounds each read from the client and each whole response sent to it (sendall's
# timeout covers the full send), not a slow query, and not a client that trickles
# request bytes.
REQUEST_TIMEOUT = 30


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
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        # It holds the upstream response open, and every caller drops it in an
        # `except Exception`; Python 3.14 and 3.15 warn if it is left for the garbage
        # collector.
        e.close()
        raise


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
    ts = int(time.time())
    # Outer guard like the sibling pollers: connect() and commit() sit outside the per-miner
    # except, and an exception escaping here would end poll_forever's thread for good.
    try:
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
    except Exception as e:
        print(f'[miners] poll error: {e}', file=sys.stderr)


# ─── Background polling ────────────────────────────────────────

def poll_forever(fn, interval_s, name=None):
    # Each poller guards itself, but this loop is the thread: one exception that slips past
    # a poller would stop that metric recording until the process restarts. Log and go on.
    while True:
        try:
            fn()
        except Exception as e:
            print(f'[poll] {name or getattr(fn, "__name__", fn)} error: {e}', file=sys.stderr)
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

# :3000 is the dev server, :3001 the dashboard served by bitaxe_api / the Docker image.
DEFAULT_ALLOWED_ORIGINS = frozenset({
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
})


def resolve_allowed_origins(cli_origins):
    """The origin allowlist, used for CORS and by HistoryHandler._check_request (the
    Origin or Referer a browser request names, and which host names Host may carry):
    the --allow-origin values if any were given (they replace the
    localhost defaults, the same rule bitaxe_api's flag follows), otherwise the defaults.
    Unlike bitaxe_api this does NOT auto-allow private-IP origins: every origin a
    dashboard is opened from must be listed exactly. Values are trimmed, lowercased (a
    browser sends the host lowercase) and stripped of a trailing slash; anything empty
    after that is dropped, since an empty entry would match a request with no Origin."""
    origins = frozenset(filter(None, (o.strip().rstrip('/').lower() for o in (cli_origins or []))))
    return origins or DEFAULT_ALLOWED_ORIGINS


_SQLITE_INT_MIN = -(2 ** 63)
_SQLITE_INT_MAX = 2 ** 63 - 1


class HistoryHandler(BaseHTTPRequestHandler):
    timeout = REQUEST_TIMEOUT  # applied to the client socket by StreamRequestHandler
    db_path = None
    allowed_origins = DEFAULT_ALLOWED_ORIGINS
    _matched_origin = ''  # set per request by _check_request, echoed by _send_cors

    def log_message(self, fmt, *args):
        pass  # silence default access log

    def _forbid(self, reason):
        self.send_response(403)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(reason)
        return False

    def _check_request(self):
        """The checks bitaxe_api's _check_origin applies, in the same order. The Host must
        pass is_host_allowed (an IP literal, localhost, or the host of an allowed origin).
        The Origin, or the Referer when there is no Origin, is reduced to
        scheme://host:port and must be an allowed origin. With neither, the request is
        refused when the browser marks it cross-site or same-site; non-browser tools send
        none of these headers. Unlike bitaxe_api, private-IP origins are not auto-allowed
        (see resolve_allowed_origins). Sends a 403 and returns False on failure."""
        self._matched_origin = ''
        if not is_host_allowed(self.headers.get('Host'), self.allowed_origins):
            return self._forbid(b'Forbidden: host not allowed')
        origin = self.headers.get('Origin') or self.headers.get('Referer')
        if not origin:
            if self.headers.get('Sec-Fetch-Site', '').lower() in ('cross-site', 'same-site'):
                return self._forbid(b'Forbidden: origin not allowed')
            return True
        try:
            parsed = urlparse(origin)
        except ValueError:
            return self._forbid(b'Forbidden: malformed origin')
        if not parsed.scheme or not parsed.netloc:
            return self._forbid(b'Forbidden: malformed origin')
        origin = f'{parsed.scheme}://{parsed.netloc}'.lower()
        if origin not in self.allowed_origins:
            return self._forbid(b'Forbidden: origin not allowed')
        self._matched_origin = origin
        return True

    def _send_cors(self):
        # The allow-origin value depends on the request's Origin, so caches must key on it.
        self.send_header('Vary', 'Origin')
        if self._matched_origin:
            self.send_header('Access-Control-Allow-Origin',
                             self._matched_origin.replace('\r', '').replace('\n', ''))

    def do_OPTIONS(self):
        if not self._check_request():
            return
        self.send_response(204)
        self._send_cors()
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if not self._check_request():
            return
        parsed = urlparse(self.path)
        parts  = parsed.path.strip('/').split('/')

        if len(parts) != 2 or parts[0] != 'history' or parts[1] not in METRIC_QUERIES:
            self.send_response(404)
            self._send_cors()
            self.end_headers()
            return

        metric  = parts[1]
        params  = parse_qs(parsed.query)
        now     = int(time.time())
        try:
            ts_from = int(params.get('from', [now - 86400])[0])
            ts_to   = int(params.get('to',   [now])[0])
            # SQLite binds only signed 64-bit integers; anything wider raises
            # OverflowError at execute time, which would surface as a 500.
            if not all(_SQLITE_INT_MIN <= v <= _SQLITE_INT_MAX for v in (ts_from, ts_to)):
                raise ValueError('out of range')
        except ValueError:
            body = json.dumps({'error': "'from' and 'to' must be 64-bit integer unix timestamps"}).encode()
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self._send_cors()
            self.end_headers()
            self.wfile.write(body)
            return
        bucket = params.get('bucket', ['min'])[0]
        if bucket not in ('min', 'hour', 'day'):
            bucket = 'min'

        sql = METRIC_QUERIES[metric][bucket]
        try:
            conn = sqlite3.connect(self.db_path)
            # Closed on every path: a failed query (e.g. a missing table) must not leak
            # the connection. sqlite3's own context manager commits but never closes.
            try:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(sql, (ts_from, ts_to)).fetchall()
            finally:
                conn.close()
            data = [dict(r) for r in rows]
        except Exception as e:
            print(f'[api] query error: {e}', file=sys.stderr)
            self.send_response(500)
            self._send_cors()
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
    parser.add_argument('--allow-origin', action='append', default=None, dest='allow_origins',
                        help='Dashboard origin allowed to read history, e.g. '
                             'http://<lan-host>:3001 (repeatable; replaces the localhost defaults)')
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

    for name, fn, interval in [
        ('price',  lambda: poll_price(args.db),                    POLL_PRICE_S),
        ('chain',  lambda: poll_chain(args.db),                    POLL_CHAIN_S),
        ('miners', lambda: poll_miners(args.db, args.bitaxe_ips),  POLL_MINER_S),
        ('purge',  lambda: poll_purge(args.db),                    PURGE_INTERVAL_S),
    ]:
        threading.Thread(target=poll_forever, args=(fn, interval, name), daemon=True).start()

    HistoryHandler.db_path = args.db
    HistoryHandler.allowed_origins = resolve_allowed_origins(args.allow_origins)
    print(f'[daemon] Origins:    {", ".join(sorted(HistoryHandler.allowed_origins))}')
    server = SERVER_CLASS((args.bind, args.port), HistoryHandler)
    print(f'[daemon] Listening. Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('[daemon] Stopping.')


if __name__ == '__main__':
    main()
