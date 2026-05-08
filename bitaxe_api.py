#!/usr/bin/env python3
"""BitAxe Fleet API — aggregates multiple miners into a single JSON endpoint.

Usage:
    python bitaxe_api.py                                    # no miners by default — set BITAXE_IPS
    BITAXE_IPS=192.168.x.x,192.168.x.y python bitaxe_api.py  # set your miner IPs via env
    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://192.168.x.x:3000

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


import ipaddress

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bitaxe_config.json')


def load_config(path=CONFIG_PATH):
    """Return list of IPs from config file, or [] if missing/corrupt."""
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        ips = data.get('bitaxe_ips', [])
        return [str(ip) for ip in ips if isinstance(ip, str) and ip.strip()]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def save_config(path=CONFIG_PATH, ips=()):
    """Persist IPs to config file as JSON. Logs a warning on write failure."""
    try:
        with open(path, 'w') as f:
            json.dump({'bitaxe_ips': list(ips)}, f, indent=2)
    except OSError as e:
        print(f'[BitAxe API] WARNING: could not save config to {path}: {e}')


def is_private_ip(host):
    """Return True if host is an RFC 1918 private address or loopback."""
    try:
        addr = ipaddress.ip_address(host)
        return addr.is_private or addr.is_loopback
    except ValueError:
        return False

def validate_ips(raw_ips):
    """Return (valid_ips, errors). Each input is trimmed; blanks skipped.
    Valid = parseable IPv4/IPv6 AND private/loopback. Dedupes preserving order."""
    valid = []
    errors = []
    seen = set()
    for raw in raw_ips:
        if not isinstance(raw, str):
            errors.append(f'not a string: {raw!r}')
            continue
        ip = raw.strip()
        if not ip:
            continue
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            errors.append(f'invalid IP: {ip}')
            continue
        if not (addr.is_private or addr.is_loopback):
            errors.append(f'not a private/LAN address: {ip}')
            continue
        if ip in seen:
            continue
        seen.add(ip)
        valid.append(ip)
    return valid, errors

def is_origin_allowed(origin, allowlist):
    """Return True if origin is in the allowlist or is from a private/loopback IP."""
    if not origin:
        return False
    host = urlparse(origin).hostname or ''
    if is_private_ip(host):
        return True
    return origin in allowlist

# Mutable runtime list — finalized in __main__ after parsing args/env/config.
# Setup endpoint mutates this in place when user submits IPs.
BITAXE_IPS = []
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
    CONFIG_PATH = CONFIG_PATH  # overridden in __main__ from args.config
    _setup_page = None
    _dashboard = None

    def _check_origin(self):
        origin = self.headers.get('Origin') or self.headers.get('Referer')
        # No Origin header = same-origin fetch or direct tool access — allow.
        if not origin:
            self._matched_origin = ''
            return True
        parsed = urlparse(origin)
        if not parsed.scheme or not parsed.netloc:
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Forbidden: malformed origin')
            return False
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if not is_origin_allowed(origin, BitaxeAPIHandler.ALLOWED_ORIGINS):
            self.send_response(403)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'Forbidden: origin not allowed')
            return False
        self._matched_origin = origin  # store for _cors() to use
        return True

    def do_OPTIONS(self):
        if not self._check_origin():
            return
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        # Dashboard HTML — no origin check; same-origin after load
        if self.path in ('/', '/index.html', '/setup', '/setup.html'):
            unconfigured = len(BITAXE_IPS) == 0
            forced_setup = self.path in ('/setup', '/setup.html')
            if unconfigured or forced_setup:
                page = BitaxeAPIHandler._setup_page
                if page is None:
                    self.send_response(500)
                    self.end_headers()
                    self.wfile.write(b'setup.html missing')
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(page)))
                self.end_headers()
                self.wfile.write(page)
                return
            dashboard = BitaxeAPIHandler._dashboard
            if dashboard is None:
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b'Dashboard not found. Run build.js first.')
                return
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(dashboard)))
            self.end_headers()
            self.wfile.write(dashboard)
            return
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

    def do_POST(self):
        if self.path != '/api/setup':
            self.send_response(404)
            self.end_headers()
            return
        if not self._check_origin():
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if length <= 0 or length > 10_000:
            self._json(400, {'error': 'missing or oversized body'})
            return
        try:
            body = json.loads(self.rfile.read(length).decode('utf-8'))
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._json(400, {'error': 'invalid JSON'})
            return
        raw = body.get('bitaxe_ips')
        if not isinstance(raw, list):
            self._json(400, {'error': 'bitaxe_ips must be a list of strings'})
            return
        valid, errors = validate_ips(raw)
        if errors or not valid:
            self._json(400, {'error': 'validation failed', 'errors': errors or ['no valid IPs provided']})
            return
        save_config(BitaxeAPIHandler.CONFIG_PATH, valid)
        BITAXE_IPS[:] = valid
        print(f'[BitAxe API] Configured miners: {", ".join(valid)}')
        self._json(200, {'bitaxe_ips': valid})

    def _json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        origin = getattr(self, '_matched_origin', '')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # PNA: allow page on loopback (http://localhost) to fetch this private-IP server.
        # Required by Chrome 130+ when source is loopback and target is a private network.
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def log_message(self, fmt, *args):
        print(f'[BitAxe API] {fmt % args}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', default='127.0.0.1',
                        help='Interface to bind to (default 127.0.0.1; use 0.0.0.0 for LAN)')
    parser.add_argument('--port', type=int, default=3001)
    parser.add_argument('--allow-origin', dest='allow_origins', action='append', default=None,
                        help='Allowed Origin/Referer (repeatable)')
    parser.add_argument('--dashboard', default=None,
                        help='Path to index.html (default: index.html next to this script)')
    parser.add_argument('--ips', default=None,
                        help='Comma-separated BitAxe IPs (overrides env and config file)')
    parser.add_argument('--config', default=CONFIG_PATH,
                        help=f'Path to config file (default: {CONFIG_PATH})')
    args = parser.parse_args()

    # IP precedence: --ips > BITAXE_IPS env > config file > empty
    if args.ips:
        cli_ips = [ip.strip() for ip in args.ips.split(',') if ip.strip()]
        valid, errs = validate_ips(cli_ips)
        for e in errs:
            print(f'[BitAxe API] --ips ignored entry: {e}')
        BITAXE_IPS[:] = valid
    elif os.environ.get('BITAXE_IPS', '').strip():
        env_ips = [ip.strip() for ip in os.environ['BITAXE_IPS'].split(',') if ip.strip()]
        valid, errs = validate_ips(env_ips)
        for e in errs:
            print(f'[BitAxe API] BITAXE_IPS env ignored entry: {e}')
        BITAXE_IPS[:] = valid
    else:
        BITAXE_IPS[:] = load_config(args.config)

    BitaxeAPIHandler.CONFIG_PATH = args.config

    if args.allow_origins is None:
        args.allow_origins = [
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:3001', 'http://127.0.0.1:3001',
            'http://localhost:3002', 'http://127.0.0.1:3002',
        ]
    BitaxeAPIHandler.ALLOWED_ORIGINS = args.allow_origins

    # Load dashboard HTML once at startup
    dashboard_path = args.dashboard or os.path.join(os.path.dirname(__file__), 'index.html')
    if os.path.exists(dashboard_path):
        with open(dashboard_path, 'rb') as f:
            BitaxeAPIHandler._dashboard = f.read()
        print(f'Dashboard        ->  http://{args.bind}:{args.port}/')
    else:
        BitaxeAPIHandler._dashboard = None
        print(f'Dashboard        ->  (index.html not found -- run build.js first)')

    setup_path = os.path.join(os.path.dirname(__file__), 'setup.html')
    if os.path.exists(setup_path):
        with open(setup_path, 'rb') as f:
            BitaxeAPIHandler._setup_page = f.read()
    else:
        BitaxeAPIHandler._setup_page = None
        print('[BitAxe API] WARN: setup.html not found — first-launch onboarding disabled')

    server = HTTPServer((args.bind, args.port), BitaxeAPIHandler)
    print(f'BitAxe Fleet API  ->  http://{args.bind}:{args.port}/api/miners')
    if BITAXE_IPS:
        print(f'Monitoring: {", ".join(BITAXE_IPS)}')
    else:
        print('Monitoring: (none configured — open the dashboard URL to run setup)')
    print('Press Ctrl+C to stop.\n')
    server.serve_forever()
