import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadV2Prefs, saveV2Prefs, deepMerge, PREFS_DEFAULTS, PREFS_VERSION } from '../../src/utils/v2prefs.js';

describe('deepMerge', () => {
  it('merges nested objects, defaults fill gaps', () => {
    const result = deepMerge({ a: { b: 1, c: 2 } }, { a: { b: 99 } });
    expect(result.a).toEqual({ b: 99, c: 2 });
  });
  it('returns defaults when overrides is empty', () => {
    expect(deepMerge({ x: 1 }, {}).x).toBe(1);
  });
  it('does not deep-merge arrays — override wins', () => {
    expect(deepMerge({ arr: [1, 2] }, { arr: [3] }).arr).toEqual([3]);
  });
  it('override wins for scalar values', () => {
    expect(deepMerge({ n: 10 }, { n: 99 }).n).toBe(99);
  });
});

describe('loadV2Prefs', () => {
  let store = {};
  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] ?? null);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns defaults when nothing stored', () => {
    const p = loadV2Prefs();
    expect(p.alerts.fee.threshold).toBe(PREFS_DEFAULTS.alerts.fee.threshold);
    expect(p.feeds.coindesk).toBe(true);
  });
  it('returns defaults on version mismatch', () => {
    store['dn.prefs.v2'] = JSON.stringify({ version: 1, alerts: { fee: { threshold: 999 } } });
    const p = loadV2Prefs();
    expect(p.alerts.fee.threshold).toBe(PREFS_DEFAULTS.alerts.fee.threshold);
  });
  it('merges saved prefs with defaults, preserving unset defaults', () => {
    store['dn.prefs.v2'] = JSON.stringify({
      version: PREFS_VERSION,
      alerts: { fee: { enabled: false } },
    });
    const p = loadV2Prefs();
    expect(p.alerts.fee.enabled).toBe(false);
    expect(p.alerts.fee.threshold).toBe(PREFS_DEFAULTS.alerts.fee.threshold);
  });
  it('returns defaults on JSON parse error', () => {
    store['dn.prefs.v2'] = 'not-json';
    expect(loadV2Prefs().version).toBe(PREFS_VERSION);
  });
});

describe('saveV2Prefs', () => {
  let store = {};
  beforeEach(() => {
    store = {};
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((k, v) => { store[k] = v; });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(k => store[k] ?? null);
  });
  afterEach(() => vi.restoreAllMocks());

  it('stores under dn.prefs.v2 with version stamp', () => {
    saveV2Prefs({ alerts: {}, feeds: {}, intervals: {}, theme: 'dark' });
    const saved = JSON.parse(store['dn.prefs.v2']);
    expect(saved.version).toBe(PREFS_VERSION);
    expect(saved.theme).toBe('dark');
  });
});
