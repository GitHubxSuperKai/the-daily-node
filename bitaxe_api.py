#!/usr/bin/env python3
"""BitAxe Fleet API — aggregates multiple miners into a single JSON endpoint.

Usage:
    python bitaxe_api.py                                    # uses default IPs
    BITAXE_IPS=10.0.0.5,10.0.0.6 python bitaxe_api.py     # override via env
    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://192.168.1.100:3000

Then open Command Center.html. The dashboard will poll http://localhost:3001/api/miners.
"""
import argparse
import json
import os
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse


def is_origin_allowed(origin, allowlist):
    """Return True if origin string exactly matches any entry in allowlist."""
    if not origin or not allowlist:
        return False
    return origin in allowlist

BITAXE_IPS    = [ip.strip() for ip in os.environ.get('BITAXE_IPS', '192.168.1.6,192.168.1.7').split(',') if ip.strip()]
PORT          = 3001
FETCH_TIMEOUT = 5


def fetch_miner(ip):
    try:
        url = f'http://{ip}/api/system/info'
        req = urllib.request.Request(url, headers={'User-Agent': 'DailyNode/1.0'})
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
            return {'ip': ip, 'online': True, 'data': data}
    except Exception as e:
        return {'ip': ip, 'online': False, 'error': str(e)}


def fetch_all_miners():
    results = [None] * len(BITAXE_IPS)

    def worker(i, ip):
        results[i] = fetch_miner(ip)

    threads = [threading.Thread(target=worker, args=(i, ip)) for i, ip in enumerate(BITAXE_IPS)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=FETCH_TIMEOUT + 1)

    return [r for r in results if r is not None]


class BitaxeAPIHandler(BaseHTTPRequestHandler):
    ALLOWED_ORIGINS = []

    def _check_origin(self):
        origin = self.headers.get('Origin') or self.headers.get('Referer')
        # Strip path from Referer if present
        if origin:
            parsed = urlparse(origin)
            origin = f"{parsed.scheme}://{parsed.netloc}"
        if not is_origin_allowed(origin, BitaxeAPIHandler.ALLOWED_ORIGINS):
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Forbidden: origin not allowed')
            return False
        return True

    def do_OPTIONS(self):
        if not self._check_origin():
            return
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if not self._check_origin():
            return
        if self.path == '/api/miners':
            miners = fetch_all_miners()
            body = json.dumps({'miners': miners, 'count': len(miners)}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def _cors(self):
        origin = self.headers.get('Origin', '')
        if origin in BitaxeAPIHandler.ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        print(f'[BitAxe API] {fmt % args}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', default='127.0.0.1',
                        help='Interface to bind to (default 127.0.0.1; use 0.0.0.0 for LAN)')
    parser.add_argument('--port', type=int, default=3001)
    parser.add_argument('--allow-origin', dest='allow_origins', action='append', default=[
        'http://localhost:3000', 'http://127.0.0.1:3000',
        'http://localhost:3002', 'http://127.0.0.1:3002',
    ], help='Allowed Origin/Referer (repeatable)')
    args = parser.parse_args()
    BitaxeAPIHandler.ALLOWED_ORIGINS = args.allow_origins
    server = HTTPServer((args.bind, args.port), BitaxeAPIHandler)
    print(f'BitAxe Fleet API  →  http://{args.bind}:{args.port}/api/miners')
    print(f'Monitoring: {", ".join(BITAXE_IPS)}')
    print(f'Allowed origins: {BitaxeAPIHandler.ALLOWED_ORIGINS}')
    print('Press Ctrl+C to stop.\n')
    server.serve_forever()
