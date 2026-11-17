// Behaviour test for tests/e2e/port.cjs -- the free-port helper behind `npm run verify`.
//
// verify must never use a fixed port (3002 belongs to the history daemon and the
// launch.json dev server), and two runs from two worktrees must not collide. The helper
// asks the OS for a port by listening on 0 across all interfaces, as server.js does, and
// hands that port to the webServer. This checks the port it returns is real and free:
// in range, and bindable by the next listener.
import { describe, it, expect } from 'vitest';
import net from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { getFreePort } = require(path.join(REPO_ROOT, 'tests', 'e2e', 'port.cjs'));

describe('getFreePort', () => {
  it('resolves to an integer port in 1024-65535', async () => {
    const port = await getFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThanOrEqual(1024);
    expect(port).toBeLessThanOrEqual(65535);
  });

  it('returns a port the next listener can bind', async () => {
    const port = await getFreePort();
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, resolve);
    });
    expect(server.address().port).toBe(port);
    await new Promise(resolve => server.close(resolve));
  });
});
