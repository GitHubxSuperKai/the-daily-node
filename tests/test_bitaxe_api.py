import os
import re
import sys
import tempfile
import threading
import time
import unittest
import unittest.mock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import bitaxe_api


class ConfigIOTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        self.tmp.close()
        os.unlink(self.tmp.name)  # path exists but file does not yet
        self.path = self.tmp.name

    def tearDown(self):
        if os.path.exists(self.path):
            os.unlink(self.path)

    def test_load_missing_returns_empty_list(self):
        self.assertEqual(bitaxe_api.load_config(self.path), [])

    def test_save_then_load_roundtrip(self):
        bitaxe_api.save_config(self.path, ['127.0.0.1', '::1'])
        self.assertEqual(
            bitaxe_api.load_config(self.path),
            ['127.0.0.1', '::1'],
        )

    def test_load_corrupt_json_returns_empty_list(self):
        with open(self.path, 'w') as f:
            f.write('{not json')
        self.assertEqual(bitaxe_api.load_config(self.path), [])


class ValidateIPsTests(unittest.TestCase):
    def test_accepts_valid_private_ips(self):
        ok, errors = bitaxe_api.validate_ips(['192.168.1.10', '10.0.0.5'])
        self.assertEqual(ok, ['192.168.1.10', '10.0.0.5'])
        self.assertEqual(errors, [])

    def test_rejects_malformed(self):
        ok, errors = bitaxe_api.validate_ips(['not-an-ip', '999.999.0.0'])
        self.assertEqual(ok, [])
        self.assertEqual(len(errors), 2)

    def test_strips_whitespace_and_skips_blank(self):
        ok, errors = bitaxe_api.validate_ips(['  192.168.1.10  ', '', '   '])
        self.assertEqual(ok, ['192.168.1.10'])
        self.assertEqual(errors, [])

    def test_dedupes(self):
        ok, errors = bitaxe_api.validate_ips(['192.168.1.10', '192.168.1.10'])
        self.assertEqual(ok, ['192.168.1.10'])
        self.assertEqual(errors, [])

    def test_rejects_public_ip(self):
        ok, errors = bitaxe_api.validate_ips(['8.8.8.8'])
        self.assertEqual(ok, [])
        self.assertEqual(len(errors), 1)


class FetchAllMinersTests(unittest.TestCase):
    # MINERS_DEADLINE is patched down to DEADLINE unless a test passes its own. SLACK
    # covers a loaded CI runner (thread start-up, scheduling), not the code under test.
    DEADLINE = 0.3
    SLACK = 1.0

    def setUp(self):
        self._saved_ips = list(bitaxe_api.BITAXE_IPS)
        self.release = threading.Event()
        self.addCleanup(self.release.set)  # let the stuck worker threads finish

    def tearDown(self):
        bitaxe_api.BITAXE_IPS[:] = self._saved_ips

    def _fetch_all(self, hang, deadline=DEADLINE):
        def fetch(ip):
            if ip in hang:
                self.release.wait(30)
            return {'ip': ip, 'online': True, 'data': {}}

        with unittest.mock.patch.object(bitaxe_api, 'fetch_miner', fetch), \
                unittest.mock.patch.object(bitaxe_api, 'MINERS_DEADLINE', deadline):
            started = time.monotonic()
            miners = bitaxe_api.fetch_all_miners()
            return miners, time.monotonic() - started

    def test_a_miner_still_fetching_at_the_deadline_is_reported_offline(self):
        # urlopen's timeout bounds each socket operation, not the whole fetch, so a
        # worker can outlast the deadline. It must come back offline, not go missing.
        bitaxe_api.BITAXE_IPS[:] = ['10.0.0.1', '10.0.0.2', '10.0.0.3']
        miners, _ = self._fetch_all(hang={'10.0.0.2'})

        self.assertEqual([m['ip'] for m in miners], ['10.0.0.1', '10.0.0.2', '10.0.0.3'])
        self.assertEqual(miners[1], {'ip': '10.0.0.2', 'online': False,
                                     'error': f'no response within {self.DEADLINE}s'})
        self.assertTrue(miners[0]['online'])
        self.assertTrue(miners[2]['online'])

    def test_several_hung_miners_share_one_deadline(self):
        # Joined one after another with a timeout each, eight hung miners would take
        # eight deadlines (2.4s); with a shared deadline they take one (0.3s).
        ips = [f'10.0.0.{n}' for n in range(1, 10)]
        bitaxe_api.BITAXE_IPS[:] = ips
        miners, elapsed = self._fetch_all(hang=set(ips[:8]))

        self.assertEqual([m['online'] for m in miners], [False] * 8 + [True])
        self.assertGreaterEqual(elapsed, self.DEADLINE)
        self.assertLess(elapsed, self.DEADLINE + self.SLACK)

    def test_every_miner_finishing_returns_at_once_with_no_offline_entries(self):
        bitaxe_api.BITAXE_IPS[:] = ['10.0.0.1', '10.0.0.2', '10.0.0.3']
        # A generous deadline: the response must not wait it out when nobody hangs.
        miners, elapsed = self._fetch_all(hang=set(), deadline=10)

        self.assertEqual(miners, [{'ip': ip, 'online': True, 'data': {}}
                                  for ip in ['10.0.0.1', '10.0.0.2', '10.0.0.3']])
        self.assertLess(elapsed, self.SLACK)

    def test_a_hung_miner_is_answered_within_the_dashboards_budget(self):
        # Unpatched deadline: the response must arrive before useBitaxe aborts the
        # /api/miners request, or the offline entry above never reaches the dashboard.
        hook = os.path.join(os.path.dirname(__file__), '..', 'src', 'hooks', 'useBitaxe.js')
        with open(hook, encoding='utf-8') as f:
            m = re.search(r"fetch\('/api/miners',\s*\{\s*signal:\s*AbortSignal\.timeout\((\d+)\)",
                          f.read())
        self.assertIsNotNone(m, 'useBitaxe.js no longer aborts /api/miners via AbortSignal.timeout')
        client_budget = int(m.group(1)) / 1000
        self.assertLessEqual(bitaxe_api.MINERS_DEADLINE, client_budget - 1)

        bitaxe_api.BITAXE_IPS[:] = ['10.0.0.1', '10.0.0.2', '10.0.0.3']
        miners, elapsed = self._fetch_all(hang={'10.0.0.2'}, deadline=bitaxe_api.MINERS_DEADLINE)

        self.assertFalse(miners[1]['online'])
        self.assertLess(elapsed, client_budget)


if __name__ == '__main__':
    unittest.main()
