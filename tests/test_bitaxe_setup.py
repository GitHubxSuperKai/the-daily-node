"""Unit tests for /api/setup GET endpoint."""
import json
import sys
import os
import tempfile
import threading
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bitaxe_api


def _start_server():
    """Start the API server on an ephemeral port in a background thread."""
    cfg_fd, cfg_path = tempfile.mkstemp(suffix='.json')
    os.close(cfg_fd)
    with open(cfg_path, 'w') as f:
        json.dump({'bitaxe_ips': []}, f)

    bitaxe_api.BITAXE_IPS[:] = []
    bitaxe_api.CONFIGURED = False
    bitaxe_api.BitaxeAPIHandler.CONFIG_PATH = cfg_path
    bitaxe_api.BitaxeAPIHandler.ALLOWED_ORIGINS = []

    from http.server import HTTPServer
    server = HTTPServer(('127.0.0.1', 0), bitaxe_api.BitaxeAPIHandler)
    port = server.server_address[1]
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    return server, port, cfg_path


def _get_json(port, path):
    req = urllib.request.Request(f'http://127.0.0.1:{port}{path}')
    with urllib.request.urlopen(req, timeout=2) as resp:
        return resp.status, json.loads(resp.read().decode())


def _post_json(port, path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f'http://127.0.0.1:{port}{path}',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=2) as resp:
        return resp.status, json.loads(resp.read().decode())


def test_get_setup_returns_empty_when_unconfigured():
    server, port, cfg_path = _start_server()
    try:
        status, body = _get_json(port, '/api/setup')
        assert status == 200
        assert body == {'bitaxe_ips': [], 'configured': False}
    finally:
        server.shutdown()
        os.unlink(cfg_path)


def test_get_setup_reflects_post():
    server, port, cfg_path = _start_server()
    try:
        _post_json(port, '/api/setup', {'bitaxe_ips': ['192.168.1.10', '10.0.0.5']})
        status, body = _get_json(port, '/api/setup')
        assert status == 200
        assert body == {'bitaxe_ips': ['192.168.1.10', '10.0.0.5'], 'configured': True}
    finally:
        server.shutdown()
        os.unlink(cfg_path)


def test_get_setup_configured_true_after_empty_post():
    """Skip path: POST [] sets CONFIGURED=True even with no IPs."""
    server, port, cfg_path = _start_server()
    try:
        _post_json(port, '/api/setup', {'bitaxe_ips': []})
        status, body = _get_json(port, '/api/setup')
        assert status == 200
        assert body == {'bitaxe_ips': [], 'configured': True}
    finally:
        server.shutdown()
        os.unlink(cfg_path)
