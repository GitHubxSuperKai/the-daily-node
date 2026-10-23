import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The image ships a HEALTHCHECK so a plain `docker run` gets a health status,
// not only compose users. Its probe must stay the exact string the compose
// healthcheck ships: docker.yml's smoke job executes that compose probe inside
// the built image, so equality is what proves the Dockerfile probe works too.
const root = resolve(__dirname, '../..');
const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8');
const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');

function dockerfileHealthcheck() {
  const lines = dockerfile.split('\n').filter(l => /^HEALTHCHECK\b/.test(l));
  expect(lines).toHaveLength(1);
  const m = lines[0].match(/^HEALTHCHECK((?:\s+--[a-z-]+=\S+)*)\s+CMD\s+(\[.*\])\s*$/);
  expect(m, 'HEALTHCHECK must use the exec (JSON array) CMD form').toBeTruthy();
  const opts = Object.fromEntries(
    m[1].trim().split(/\s+/).filter(Boolean).map(o => o.replace(/^--/, '').split('=')),
  );
  return { opts, cmd: JSON.parse(m[2]) };
}

function composeHealthcheck() {
  const block = compose.split(/^\s*healthcheck:\s*$/m)[1];
  const field = (k) => block.match(new RegExp(`^\\s*${k}:\\s*(.+)$`, 'm'))[1].trim();
  return {
    cmd: JSON.parse(field('test')),
    opts: {
      interval: field('interval'), timeout: field('timeout'),
      retries: field('retries'), 'start-period': field('start_period'),
    },
  };
}

describe('Dockerfile HEALTHCHECK', () => {
  it('exists and runs the same python probe as the compose healthcheck', () => {
    const df = dockerfileHealthcheck();
    const dc = composeHealthcheck();
    expect(df.cmd.slice(0, 3)).toEqual(['python3', '-c', df.cmd[2]]);
    expect(dc.cmd[0]).toBe('CMD');
    expect(df.cmd).toEqual(dc.cmd.slice(1));
  });

  it('uses the same timing as the compose healthcheck', () => {
    expect(dockerfileHealthcheck().opts).toEqual(composeHealthcheck().opts);
  });
});
