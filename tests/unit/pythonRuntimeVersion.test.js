import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// build.yml's python-runtime job exists to test the Python version the Docker image
// runs. Dependabot's docker entry bumps the Dockerfile's FROM line alone, so without
// this check the job would stay green on the old version and stop meaning anything.
const require = createRequire(import.meta.url);
const root = resolve(__dirname, '../..');
const { parseYaml } = require(resolve(root, 'scripts', 'check-docker-smoke.cjs'));
const asLF = s => s.replace(/\r\n/g, '\n');

function runtimeImageVersion() {
  const froms = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
    .split(/\r?\n/)
    .filter(l => /^FROM\s.*\bAS\s+runtime\s*$/i.test(l));
  expect(froms).toHaveLength(1);
  const m = froms[0].match(/^FROM\s+python:(\d+\.\d+)-slim\s+AS\s+runtime\s*$/i);
  expect(m, `runtime stage is not python:<major.minor>-slim: ${froms[0]}`).toBeTruthy();
  return m[1];
}

function ciRuntimeVersions() {
  const build = parseYaml(asLF(readFileSync(resolve(root, '.github', 'workflows', 'build.yml'), 'utf8')));
  const job = build.jobs['python-runtime'];
  expect(job, 'build.yml has no python-runtime job').toBeTruthy();
  return job.steps
    .filter(s => typeof s.uses === 'string' && s.uses.startsWith('actions/setup-python@'))
    .map(s => String(s.with['python-version']));
}

describe('python-runtime CI job', () => {
  it('tests the Python version the Docker runtime image ships', () => {
    const image = runtimeImageVersion();
    const ci = ciRuntimeVersions();
    expect(ci).toEqual([image]);
  });
});
