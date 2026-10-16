"""Unit tests for /api/setup GET endpoint."""
import json
import os
import sys
import tempfile
import threading
import unittest
import unittest.mock
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


class SetupEndpointTest(unittest.TestCase):
    """Bring up the real handler on a random port with a temp config file."""

    def setUp(self):
        self.server, self.port, self.cfg_path = _start_server()

    def tearDown(self):
        self.server.shutdown()
        os.unlink(self.cfg_path)

    def test_get_setup_returns_empty_when_unconfigured(self):
        status, body = _get_json(self.port, '/api/setup')
        self.assertEqual(status, 200)
        self.assertEqual(body, {'bitaxe_ips': [], 'configured': False})

    def test_get_setup_reflects_post(self):
        _post_json(self.port, '/api/setup', {'bitaxe_ips': ['192.168.1.10', '10.0.0.5']})
        status, body = _get_json(self.port, '/api/setup')
        self.assertEqual(status, 200)
        self.assertEqual(body, {'bitaxe_ips': ['192.168.1.10', '10.0.0.5'], 'configured': True})

    def test_get_setup_configured_true_after_empty_post(self):
        """Skip path: POST [] sets CONFIGURED=True even with no IPs."""
        _post_json(self.port, '/api/setup', {'bitaxe_ips': []})
        status, body = _get_json(self.port, '/api/setup')
        self.assertEqual(status, 200)
        self.assertEqual(body, {'bitaxe_ips': [], 'configured': True})


class SaveConfigAtomicTest(unittest.TestCase):
    """save_config used to open the live file with 'w', which truncates it before a byte
    is written. A failure mid-write (disk full, killed process) left an empty or partial
    config, and the next start lost the miner list AND the proxy allowlist."""

    def setUp(self):
        fd, self.path = tempfile.mkstemp(suffix='.json')
        os.close(fd)
        with open(self.path, 'w') as f:
            json.dump({'bitaxe_ips': ['miner-a'], 'proxy_hosts': ['keep-me']}, f)

    def tearDown(self):
        os.unlink(self.path)

    def test_failed_write_leaves_the_previous_config_intact(self):
        def dump_then_fail(obj, f, **kw):
            f.write('{"bitaxe_ips": ["half')
            raise OSError(28, 'No space left on device')

        with unittest.mock.patch('bitaxe_api.json.dump', side_effect=dump_then_fail), \
             unittest.mock.patch('builtins.print'):
            bitaxe_api.save_config(self.path, ['miner-b'])

        with open(self.path) as f:
            self.assertEqual(json.load(f), {'bitaxe_ips': ['miner-a'], 'proxy_hosts': ['keep-me']})
        leftovers = [n for n in os.listdir(os.path.dirname(self.path))
                     if n.startswith(os.path.basename(self.path) + '.')]
        self.assertEqual(leftovers, [], 'temp file left behind')

    def test_falls_back_to_in_place_write_when_the_temp_file_cannot_be_created(self):
        # A file mounted into a directory the process cannot write: mkstemp fails before
        # any replace is attempted. The old in-place write saved fine here, so must this.
        with unittest.mock.patch('bitaxe_api.tempfile.mkstemp', side_effect=PermissionError(13, 'Permission denied')), \
             unittest.mock.patch('builtins.print'):
            bitaxe_api.save_config(self.path, ['miner-d'])
        with open(self.path) as f:
            self.assertEqual(json.load(f), {'bitaxe_ips': ['miner-d'], 'proxy_hosts': ['keep-me']})

    def test_disk_full_creating_the_temp_file_does_not_fall_back(self):
        # ENOSPC must leave the old config alone, not route into the truncating write.
        with unittest.mock.patch('bitaxe_api.tempfile.mkstemp', side_effect=OSError(28, 'No space left on device')), \
             unittest.mock.patch('builtins.print'):
            bitaxe_api.save_config(self.path, ['miner-f'])
        with open(self.path) as f:
            self.assertEqual(json.load(f), {'bitaxe_ips': ['miner-a'], 'proxy_hosts': ['keep-me']})

    def test_keeps_the_existing_file_mode(self):
        if os.name != 'posix':
            self.skipTest('POSIX permission bits')
        os.chmod(self.path, 0o400)
        bitaxe_api.save_config(self.path, ['miner-e'])
        self.assertEqual(os.stat(self.path).st_mode & 0o777, 0o400)

    def test_falls_back_to_in_place_write_when_replace_is_refused(self):
        # A file bind-mounted on its own cannot be replaced (EBUSY); it must still save.
        with unittest.mock.patch('bitaxe_api.os.replace', side_effect=OSError(16, 'Device or resource busy')), \
             unittest.mock.patch('builtins.print'):
            bitaxe_api.save_config(self.path, ['miner-c'])
        with open(self.path) as f:
            self.assertEqual(json.load(f)['bitaxe_ips'], ['miner-c'])
        leftovers = [n for n in os.listdir(os.path.dirname(self.path))
                     if n.startswith(os.path.basename(self.path) + '.')]
        self.assertEqual(leftovers, [], 'temp file left behind')

    def test_successful_write_replaces_ips_and_keeps_other_keys(self):
        bitaxe_api.save_config(self.path, ['miner-b'])
        with open(self.path) as f:
            self.assertEqual(json.load(f), {'bitaxe_ips': ['miner-b'], 'proxy_hosts': ['keep-me']})


if __name__ == '__main__':
    unittest.main()
