#!/usr/bin/env python3
"""BitAxe Fleet API — aggregates multiple miners into a single JSON endpoint.

Usage:
    python bitaxe_api.py

Then open Command Center.html. The dashboard will poll http://localhost:3001/api/miners.
"""
import json
import threading
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

BITAXE_IPS    = ['192.168.1.6', '192.168.1.7']
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
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
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
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def log_message(self, fmt, *args):
        print(f'[BitAxe API] {fmt % args}')


if __name__ == '__main__':
    server = HTTPServer(('localhost', PORT), BitaxeAPIHandler)
    print(f'BitAxe Fleet API  →  http://localhost:{PORT}/api/miners')
    print(f'Monitoring: {", ".join(BITAXE_IPS)}')
    print('Press Ctrl+C to stop.\n')
    server.serve_forever()
