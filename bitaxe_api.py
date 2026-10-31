#!/usr/bin/env python3
"""BitAxe Fleet API — aggregates multiple miners into a single JSON endpoint.

Usage:
    python bitaxe_api.py                                    # no miners by default — set BITAXE_IPS
    BITAXE_IPS=192.168.x.x,192.168.x.y python bitaxe_api.py  # set your miner IPs via env
    python bitaxe_api.py --bind 0.0.0.0 --allow-origin http://192.168.x.x:3000

Then open Command Center.html. The dashboard will poll http://localhost:3001/api/miners.
"""
import argparse
import errno
import ipaddress
import json
import os
import re
import ssl
import stat
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuses to follow 3xx redirects — the mempool-proxy validates the base
    host before fetching, but a redirect target bypasses that check entirely,
    so redirects must surface as an error instead of being followed."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


CONFIG_PATH = (
    os.environ.get('CONFIG_PATH')
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bitaxe_config.json')
)


def load_config(path=CONFIG_PATH):
    """Return list of IPs from config file, or [] if missing/corrupt."""
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        ips = data.get('bitaxe_ips', [])
        return [str(ip) for ip in ips if isinstance(ip, str) and ip.strip()]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def load_proxy_hosts(path=CONFIG_PATH):
    """Return list of authorized mempool-proxy base URLs from config file, or []."""
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        hosts = data.get('proxy_hosts', [])
        return [str(h) for h in hosts if isinstance(h, str) and h.strip()]
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return []


def save_config(path=CONFIG_PATH, ips=()):
    """Persist IPs to config file as JSON. Logs a warning on write failure.
    Preserves any other existing keys (e.g. proxy_hosts) rather than clobbering
    the whole file, so a setup POST can't silently drop the proxy allowlist."""
    existing = {}
    try:
        with open(path, 'r') as f:
            loaded = json.load(f)
        if isinstance(loaded, dict):
            existing = loaded
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        existing = {}
    existing['bitaxe_ips'] = list(ips)
    # Write a sibling temp file and os.replace() it over the config: replace is atomic, so
    # a failure mid-write leaves the previous config intact instead of a truncated one.
    #
    # The in-place write is kept as a fallback for the two layouts where the atomic path
    # cannot work: the temp file cannot be created (the config is mounted into a directory
    # this process cannot write), or the replace is refused (a file bind-mounted on its own
    # gives EBUSY). A failure while WRITING the temp file does not fall back: that is the
    # disk-full case, where an in-place write is exactly what truncates the config.
    def write_in_place(reason):
        print(f'[BitAxe API] NOTE: non-atomic config write to {path} ({reason})')
        with open(path, 'w') as f:
            json.dump(existing, f, indent=2)

    tmp = None
    try:
        try:
            fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)),
                                       prefix=os.path.basename(path) + '.', suffix='.tmp')
        except OSError as e:
            # Only a permissions refusal means "this directory is not ours to write". A
            # full disk or quota (ENOSPC/EDQUOT) must not fall through to a truncating write.
            if e.errno not in (errno.EACCES, errno.EPERM, errno.EROFS):
                raise
            write_in_place(f'temp file: {e}')
            return
        with os.fdopen(fd, 'w') as f:
            json.dump(existing, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        try:
            # mkstemp creates 0600; keep the existing file's mode so a save never makes
            # the config unreadable to whoever could read it before.
            os.chmod(tmp, stat.S_IMODE(os.stat(path).st_mode))
        except OSError:
            # No existing config to copy a mode from (first save): keep mkstemp's 0600.
            pass
        try:
            os.replace(tmp, path)
        except OSError as e:
            write_in_place(f'replace: {e}')
        else:
            tmp = None
    except OSError as e:
        print(f'[BitAxe API] WARNING: could not save config to {path}: {e}')
    finally:
        if tmp is not None:
            try:
                os.unlink(tmp)
            except OSError:
                # Best-effort cleanup of our own temp file; the save result is already
                # decided and reported above, so a leftover .tmp must not raise here.
                pass


def normalize_proxy_base(raw):
    """Canonicalize a proxy base URL to 'scheme://host:port' (lowercased scheme and
    host, explicit port, no path/query/fragment/userinfo). Return None if it is not a
    valid http/https base URL. IPv6 hosts are returned bracketed."""
    if not isinstance(raw, str) or not raw.strip():
        return None
    parsed = urlparse(raw.strip())
    if parsed.scheme not in ('http', 'https'):
        return None
    host = parsed.hostname
    if not host:
        return None
    try:
        port = parsed.port
    except ValueError:
        return None
    if port is None:
        port = 443 if parsed.scheme == 'https' else 80
    host_fmt = f'[{host}]' if ':' in host else host
    return f'{parsed.scheme}://{host_fmt}:{port}'


def validate_proxy_bases(raw_bases):
    """Return (valid_normalized, errors). Each entry must be an http/https base URL.
    Normalized to scheme://host:port and deduped, preserving first-seen order."""
    valid = []
    errors = []
    seen = set()
    for raw in raw_bases:
        normalized = normalize_proxy_base(raw)
        if normalized is None:
            errors.append(f'invalid proxy base URL: {raw!r}')
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        valid.append(normalized)
    return valid, errors


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

# A bracketed Host: '[', no further brackets, ']', then nothing, or ':' followed by any
# number of ASCII digits.
_BRACKETED_HOST_RE = re.compile(r'\[[^\[\]]*\](?::[0-9]*)?')

def is_host_allowed(host_header, allowlist):
    """Return True if the request's Host names this server the way the dashboard does:
    an IP literal, localhost, or the host of an allowlisted origin. A missing Host
    (non-browser tools) is allowed; browsers always send one.

    urlparse would read a host out of userinfo or path forms ('@', '/', '?', '#'), and
    its patch releases differ on text around IPv6 brackets, so those shapes are refused
    here, before it runs."""
    if not host_header:
        return True
    if any(c in host_header for c in '@/?#'):
        return False
    if ('[' in host_header or ']' in host_header) and not _BRACKETED_HOST_RE.fullmatch(host_header):
        return False
    try:
        host = urlparse(f'//{host_header}').hostname
    except ValueError:
        return False
    if not host:
        return False
    host = host.lower()
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass
    if host == 'localhost':
        return True
    return any((urlparse(o).hostname or '').lower() == host for o in allowlist)

# Mutable runtime list — finalized in __main__ after parsing args/env/config.
# Setup endpoint mutates this in place when user submits IPs.
BITAXE_IPS = []
# Set to True once IPs are provided at startup or via the setup page (even if
# user skips miners entirely). Controls whether GET / redirects to setup.html.
CONFIGURED = False
PORT          = 3001
FETCH_TIMEOUT = 5
# A thread per connection, so a request waiting on an upstream (a miner, a feed, the
# mempool proxy) or a connection that never sends a request (a browser's idle preconnect)
# can't hold every other request. tests/test_server_concurrency.py fails on HTTPServer.
SERVER_CLASS  = ThreadingHTTPServer
# Seconds a client socket may sit silent before the handler closes it, so an idle
# preconnect, or a peer on the LAN that connects and sends nothing, frees its thread.
# It bounds each read from the client and each whole response sent to it (sendall's
# timeout covers the full send, so a client too slow to take a body in 30s is cut off),
# not upstream work (a slow miner or feed), and not a client that trickles request bytes.
REQUEST_TIMEOUT = 30
# Serializes /api/setup POSTs: save_config is a read-modify-write of the config file, and
# the file and the in-memory BITAXE_IPS/CONFIGURED must end up from the same request.
_setup_lock = threading.Lock()

# /api/rss cache: feed key -> (time.monotonic() of the last attempt, body or None, stale).
# None marks a failed fetch with no earlier copy; a failed refetch keeps the old body
# and sets stale, which is sent as X-Feed-Stale: 1 until a refetch succeeds (the
# dashboard reads it to tell an upstream outage from a fresh 200).
# Either way the attempt is stamped, so a feed is tried at most once per TTL.
# No lock: each dict read and write is atomic. Two requests that miss the same key
# at once both fetch it (one extra fetch), and a failing fetch re-reads the entry
# just before stamping it, so a copy another thread cached during the fetch survives
# (only a success landing between that re-read and the stamp is lost).
# The TTL must exceed the dashboard's 300s news poll (REFRESH_INTERVALS.news in
# src/config.js), or every poll misses the cache and refetches every feed.
RSS_CACHE_TTL  = 330
RSS_SIZE_LIMIT = 2 * 1024 * 1024
# Time budget for reading one feed's BODY. The urllib timeout only bounds each socket
# read, so an upstream trickling its body a byte at a time would otherwise hold this
# request (and its thread) indefinitely; this caps the body phase at the budget plus one
# read timeout. NOT covered: connecting, TLS, and the status/header lines, which
# opener.open() reads before the loop. An upstream trickling its headers can still
# hold that request's thread; bounding that needs a watchdog thread, which was decided
# against.
RSS_FETCH_DEADLINE = FETCH_TIMEOUT - 1
_rss_cache = {}


def _fetch_feed(target):
    """Fetch one feed body: redirects refused, size-capped, body read time-bounded (see
    RSS_FETCH_DEADLINE for what that does not cover). Raises on any failure
    (urllib.error.HTTPError for an upstream status, including a refused 3xx)."""
    req = urllib.request.Request(target, headers={'User-Agent': 'DailyNode/1.0'})
    opener = urllib.request.build_opener(_NoRedirect)
    deadline = time.monotonic() + RSS_FETCH_DEADLINE
    chunks, size = [], 0
    with opener.open(req, timeout=RSS_FETCH_DEADLINE) as resp:
        while size < RSS_SIZE_LIMIT:
            if time.monotonic() > deadline:
                raise TimeoutError('exceeded the body-read deadline')
            chunk = resp.read1(min(64 * 1024, RSS_SIZE_LIMIT - size))
            if not chunk:
                break
            chunks.append(chunk)
            size += len(chunk)
    if size >= RSS_SIZE_LIMIT:
        raise ValueError('upstream response too large')
    return b''.join(chunks)


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
    # One snapshot: an /api/setup POST on another thread can replace BITAXE_IPS between
    # sizing `results` and starting the workers.
    ips = list(BITAXE_IPS)
    results = [None] * len(ips)

    def worker(i, ip):
        results[i] = fetch_miner(ip)

    threads = [threading.Thread(target=worker, args=(i, ip)) for i, ip in enumerate(ips)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=FETCH_TIMEOUT + 1)

    return [r for r in results if r is not None]


# Latest ESP-Miner release, for the dashboard's "firmware update" badge. The URL is
# a constant (no caller input reaches it), and releases/latest already excludes
# drafts and prereleases. Unauthenticated GitHub API is 60 req/h per IP, so cache.
FIRMWARE_RELEASE_URL = 'https://api.github.com/repos/bitaxeorg/ESP-Miner/releases/latest'
FIRMWARE_TTL   = 6 * 60 * 60
FIRMWARE_RETRY = 15 * 60
_FIRMWARE_TAG  = re.compile(r'v?\d+\.\d+\.\d+[A-Za-z0-9.+-]{0,32}')
_firmware_cache = {'latest': None, 'next_check': None}
_firmware_lock  = threading.Lock()


def latest_firmware(now=None):
    """Latest release tag, cached; on failure, the last good value (or None)."""
    now = time.time() if now is None else now
    next_check = _firmware_cache['next_check']
    if next_check is not None and now < next_check:
        return _firmware_cache['latest']
    # The server is threaded: one thread refreshes. With a tag cached, any other caller
    # meanwhile gets it at once; with none cached it waits for that lookup (each socket
    # operation bounded by FETCH_TIMEOUT) rather than answer null, which the dashboard would keep for 6h.
    if not _firmware_lock.acquire(blocking=_firmware_cache['latest'] is None):
        return _firmware_cache['latest']
    try:
        # Re-check: the thread that held the lock may have just refreshed the cache.
        next_check = _firmware_cache['next_check']
        if next_check is None or now >= next_check:
            _refresh_firmware(now)
    finally:
        _firmware_lock.release()
    return _firmware_cache['latest']


def _refresh_firmware(now):
    try:
        req = urllib.request.Request(FIRMWARE_RELEASE_URL, headers={
            'User-Agent': 'DailyNode/1.0', 'Accept': 'application/vnd.github+json',
        })
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            tag = json.loads(resp.read(256 * 1024).decode()).get('tag_name')
        if not isinstance(tag, str) or not _FIRMWARE_TAG.fullmatch(tag):
            raise ValueError('unexpected tag_name')
        _firmware_cache['latest'] = tag
        _firmware_cache['next_check'] = now + FIRMWARE_TTL
    except Exception:
        _firmware_cache['next_check'] = now + FIRMWARE_RETRY


class BitaxeAPIHandler(BaseHTTPRequestHandler):
    timeout = REQUEST_TIMEOUT  # applied to the client socket by StreamRequestHandler
    ALLOWED_ORIGINS = []
    ALLOWED_PROXY_HOSTS = frozenset()
    ALLOWED_PROXY_BASES = frozenset()  # authorized proxy destinations: normalized scheme://host:port
    # /api/rss outbound allowlist. The caller names a feed by key and can never supply
    # a URL. Keys must match RSS_FEED_MAP in src/config.js (tests/test_rss_proxy.py checks).
    # URLs are the final ones: the fetch refuses redirects, so a URL that 3xx's never loads.
    RSS_FEEDS = {
        'bitcoinMagazine': 'https://bitcoinmagazine.com/feed',
        'coindesk':        'https://www.coindesk.com/arc/outboundfeeds/rss?outputType=xml',
        'newsBitcoin':     'https://news.bitcoin.com/feed/',
        'optech':          'https://bitcoinops.org/feed.xml',
        'nobsBitcoin':     'https://www.nobsbitcoin.com/rss/',
        'stackerNews':     'https://stacker.news/rss',
        'hashrateIndex':   'https://hashrateindex.com/blog/rss/',
        'tftc':            'https://www.tftc.io/rss.xml',
    }
    CONFIG_PATH = CONFIG_PATH  # overridden in __main__ from args.config
    _setup_page = None
    _dashboard = None

    def _forbid(self, reason):
        self.send_response(403)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(reason)
        return False

    def _check_origin(self):
        if not is_host_allowed(self.headers.get('Host'), BitaxeAPIHandler.ALLOWED_ORIGINS):
            return self._forbid(b'Forbidden: host not allowed')
        origin = self.headers.get('Origin') or self.headers.get('Referer')
        # No Origin header = same-origin fetch or direct tool access — allow, unless the
        # browser says the request came from another site.
        if not origin:
            if self.headers.get('Sec-Fetch-Site', '').lower() in ('cross-site', 'same-site'):
                return self._forbid(b'Forbidden: origin not allowed')
            self._matched_origin = ''
            return True
        try:
            parsed = urlparse(origin)
        except ValueError:
            return self._forbid(b'Forbidden: malformed origin')
        if not parsed.scheme or not parsed.netloc:
            return self._forbid(b'Forbidden: malformed origin')
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if not is_origin_allowed(origin, BitaxeAPIHandler.ALLOWED_ORIGINS):
            return self._forbid(b'Forbidden: origin not allowed')
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
            unconfigured = not CONFIGURED
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
        if self.path == '/api/setup':
            body = json.dumps({
                'bitaxe_ips': list(BITAXE_IPS),
                'configured': CONFIGURED,
            }).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
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
        elif self.path == '/api/firmware':
            self._json(200, {'latest': latest_firmware()})
        elif urlparse(self.path).path == '/api/rss':
            self._rss()
        elif self.path.startswith('/api/mempool-proxy'):
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            base = params.get('base', [''])[0]
            path = params.get('path', [''])[0]
            # Reject missing /api/ prefix and dot-dot traversal segments
            if not path or not path.startswith('/api/') or '..' in path.split('/'):
                self._json(400, {'error': 'invalid path'})
                return
            base_parsed = urlparse(base)
            if base_parsed.scheme not in ('http', 'https') or not base_parsed.netloc:
                self._json(400, {'error': 'invalid base URL'})
                return
            # Block loopback and link-local SSRF — LAN addresses are expected (Start9), loopback/metadata are not
            try:
                ip = ipaddress.ip_address(base_parsed.hostname or '')
                # Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1) before checking so
                # is_loopback / is_link_local fire correctly for the mapped address.
                if ip.version == 6 and ip.ipv4_mapped:
                    ip = ip.ipv4_mapped
                if ip.is_loopback or ip.is_link_local or ip.is_unspecified:
                    self._json(400, {'error': 'loopback/link-local destinations not allowed'})
                    return
            except ValueError:
                if base_parsed.hostname not in self.ALLOWED_PROXY_HOSTS:
                    self._json(400, {'error': 'hostname-based proxy URLs are not supported; use an IP address'})
                    return
            # Outbound allowlist — the SSRF gate (CWE-918). The destination origin must
            # be explicitly authorized server-side (--allow-proxy / config proxy_hosts).
            # The IP/hostname checks above are defense-in-depth; THIS is what stops a
            # caller from directing the request at an arbitrary internal host.
            base_norm = normalize_proxy_base(base)
            if base_norm is None or base_norm not in self.ALLOWED_PROXY_BASES:
                self._json(403, {'error': 'destination not in proxy allowlist'})
                return
            # Endpoint allowlist for the caller-controlled `path`. The host half is already
            # locked to the server-side allowlist (above, #190); this locks the path half to
            # exactly the mempool endpoints the dashboard requests, so a caller can no longer
            # widen the request to arbitrary paths on the already-trusted node (CodeQL
            # py/partial-ssrf #191). Both branches are recognized taint barriers: `in` against
            # a set of string literals is a constant-comparison barrier, and re.fullmatch()
            # constrains the parametric pool-blocks slug so it can't inject path/authority
            # characters. Keep this set in sync with mempoolGet() callers in src/utils/api.js.
            if path in {
                '/api/blocks/tip/height',
                '/api/v1/mining/hashrate/3d',
                '/api/v1/fees/recommended',
                '/api/mempool',
                '/api/v1/difficulty-adjustment',
                '/api/v1/mining/pools/1w',
                '/api/v1/blocks',
                '/api/v1/fees/mempool-blocks',
            }:
                safe_path = path
            elif re.fullmatch(r'/api/v1/mining/pool/[A-Za-z0-9._-]{1,64}/blocks', path):
                safe_path = path
            else:
                self._json(400, {'error': 'path not in proxy endpoint allowlist'})
                return
            # base_norm is now proven to be a member of the allowlist. Source the authority
            # string from the frozenset itself (config-derived, not caller-derived) so both a
            # human reader and static taint analysis see the request host as server-controlled.
            # `safe_path` is barrier-validated above, so appending it can only reach one of the
            # known mempool endpoints — it can never alter the scheme/host/port authority.
            authorized_base = next(b for b in self.ALLOWED_PROXY_BASES if b == base_norm)
            target = authorized_base + safe_path
            # Disable SSL verification for self-hosted nodes (self-signed certs)
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
            _PROXY_SIZE_LIMIT = 512 * 1024
            try:
                req = urllib.request.Request(target, headers={'User-Agent': 'DailyNode/1.0'})
                opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl_ctx), _NoRedirect)
                with opener.open(req, timeout=FETCH_TIMEOUT - 1) as resp:
                    body = resp.read(_PROXY_SIZE_LIMIT)
                if len(body) == _PROXY_SIZE_LIMIT:
                    self._json(502, {'error': 'upstream response too large'})
                    return
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Length', str(len(body)))
                self._cors()
                self.end_headers()
                self.wfile.write(body)
            except urllib.error.HTTPError as e:
                # A 3xx here means _NoRedirect refused to follow a redirect (SSRF guard);
                # surface it as an upstream error, not a client-actionable bare redirect.
                status = 502 if 300 <= e.code < 400 else e.code
                self._json(status, {'error': f'upstream {e.code}'})
            except Exception as e:
                self._json(502, {'error': f'proxy failed: {str(e)}'})
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()

    def do_POST(self):
        if self.path != '/api/setup':
            self.send_response(404)
            self.end_headers()
            return
        # Trust model: no Origin header = direct tool access (curl) — allowed by design.
        # This is a LAN-only server; the IP allow-list in validate_ips is the security gate.
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
        # Strict mode: any invalid entry rejects the whole request so the user
        # sees exactly which IPs failed rather than having them silently dropped.
        if errors:
            self._json(400, {'error': 'validation failed', 'errors': errors})
            return
        global CONFIGURED
        with _setup_lock:
            save_config(BitaxeAPIHandler.CONFIG_PATH, valid)
            BITAXE_IPS[:] = valid
            CONFIGURED = True
        if valid:
            print(f'[BitAxe API] Configured miners: {", ".join(valid)}')
        else:
            print('[BitAxe API] Setup complete — no miners configured (skipped)')
        self._json(200, {'bitaxe_ips': valid})

    def _rss(self):
        """Pass a feed's raw XML through, so the browser parses it (DOMParser) and the
        dashboard no longer depends on rss2json. Not parsed here: untrusted XML stays
        out of the server."""
        key = parse_qs(urlparse(self.path).query).get('feed', [''])[0]
        if key not in self.RSS_FEEDS:
            self._json(400, {'error': 'unknown feed'})
            return
        # The destination comes from the server-side map, never from the request.
        target = self.RSS_FEEDS[key]
        cached = _rss_cache.get(key)
        if cached and time.monotonic() - cached[0] < RSS_CACHE_TTL:
            _, body, stale = cached
            if body is None:
                self._json(502, {'error': 'feed fetch failed recently; not retried yet'})
                return
        else:
            try:
                body = _fetch_feed(target)
            except Exception as e:
                error = f'upstream {e.code}' if isinstance(e, urllib.error.HTTPError) else f'feed fetch failed: {e}'
                # Re-read: another thread may have cached a good copy while this fetch
                # was failing, and the entry read before the fetch must not replace it.
                current = _rss_cache.get(key)
                body = current[1] if current else None
                # Stale only if it is the copy this request started with (or one already
                # marked stale): a copy another thread just fetched is fresh.
                stale = body is not None and (current is cached or current[2])
                # Stamp the failure either way: retrying a hung upstream on every poll would
                # hold a request for the full fetch deadline each time.
                _rss_cache[key] = (time.monotonic(), body, stale)
                if body is None:
                    self._json(502, {'error': error})
                    return
            else:
                stale = False
                _rss_cache[key] = (time.monotonic(), body, False)
        self.send_response(200)
        # Third-party content on the dashboard's own origin: serve it so it can never
        # render as a document (an XHTML <script> in a feed opened directly would run
        # with access to /api/setup). The dashboard reads it with r.text() and DOMParser.
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; sandbox")
        self.send_header('Content-Length', str(len(body)))
        if stale:
            self.send_header('X-Feed-Stale', '1')
        self._cors()
        self.end_headers()
        self.wfile.write(body)

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
        # The allow-origin value depends on the request's Origin, so caches must key on it.
        self.send_header('Vary', 'Origin')
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin.replace('\r', '').replace('\n', ''))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        # PNA: allow page on loopback (http://localhost) to fetch this private-IP server.
        # Required by Chrome 130+ when source is loopback and target is a private network.
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def log_message(self, fmt, *args):
        args = list(args)
        if args and '/api/mempool-proxy?' in str(args[-1]):
            args[-1] = str(args[-1]).split('?')[0] + '?[redacted]'
        print(f'[BitAxe API] {fmt % tuple(args)}')


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
    parser.add_argument('--allow-proxy', dest='proxy_bases', action='append', default=None,
                        help='Authorized mempool-proxy base URL, e.g. '
                             'https://192.168.x.x:3006 (repeatable). Overrides config proxy_hosts.')
    args = parser.parse_args()

    # IP precedence: --ips > BITAXE_IPS env > config file > empty
    if args.ips:
        cli_ips = [ip.strip() for ip in args.ips.split(',') if ip.strip()]
        valid, errs = validate_ips(cli_ips)
        for e in errs:
            print(f'[BitAxe API] --ips ignored entry: {e}')
        BITAXE_IPS[:] = valid
        if valid:
            CONFIGURED = True
    elif os.environ.get('BITAXE_IPS', '').strip():
        env_ips = [ip.strip() for ip in os.environ['BITAXE_IPS'].split(',') if ip.strip()]
        valid, errs = validate_ips(env_ips)
        for e in errs:
            print(f'[BitAxe API] BITAXE_IPS env ignored entry: {e}')
        BITAXE_IPS[:] = valid
        if valid:
            CONFIGURED = True
    else:
        cfg = load_config(args.config)
        BITAXE_IPS[:] = cfg
        if cfg:
            CONFIGURED = True

    BitaxeAPIHandler.CONFIG_PATH = args.config

    if args.allow_origins is None:
        args.allow_origins = [
            'http://localhost:3000', 'http://127.0.0.1:3000',
            'http://localhost:3001', 'http://127.0.0.1:3001',
            'http://localhost:3002', 'http://127.0.0.1:3002',
        ]
    BitaxeAPIHandler.ALLOWED_ORIGINS = args.allow_origins

    # Proxy allowlist precedence: --allow-proxy > config file proxy_hosts > empty.
    # Empty means the mempool-proxy rejects every destination (secure default).
    raw_bases = args.proxy_bases if args.proxy_bases is not None else load_proxy_hosts(args.config)
    proxy_bases, proxy_errs = validate_proxy_bases(raw_bases)
    for e in proxy_errs:
        print(f'[BitAxe API] --allow-proxy ignored entry: {e}')
    BitaxeAPIHandler.ALLOWED_PROXY_BASES = frozenset(proxy_bases)
    if proxy_bases:
        print(f'Proxy allowlist  ->  {", ".join(proxy_bases)}')
    else:
        print('Proxy allowlist  ->  (none — mempool-proxy rejects all destinations)')

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

    server = SERVER_CLASS((args.bind, args.port), BitaxeAPIHandler)
    print(f'BitAxe Fleet API  ->  http://{args.bind}:{args.port}/api/miners')
    if BITAXE_IPS:
        print(f'Monitoring: {", ".join(BITAXE_IPS)}')
    else:
        print('Monitoring: (none configured — open the dashboard URL to run setup)')
    print('Press Ctrl+C to stop.\n')
    server.serve_forever()
