import { describe, it, expect } from 'vitest';
import { sourceFreshness } from '../../src/utils/freshness.js';

const NOW = 1_700_000_000_000;
const MIN = 60_000;

describe('sourceFreshness', () => {
  it('returns down when no data, regardless of other fields', () => {
    expect(sourceFreshness({ hasData: false, err: false, lastOk: NOW, interval: MIN }, NOW)).toBe('down');
    expect(sourceFreshness({ hasData: false, err: true, lastOk: null }, NOW)).toBe('down');
  });

  it('returns fresh for recent data, no error, content current', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 10_000, interval: MIN }, NOW)).toBe('fresh');
  });

  it('returns stale when fetch age exceeds 2x interval', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 130_000, interval: MIN }, NOW)).toBe('stale');
  });

  it('returns fresh exactly at the 2x interval boundary', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 120_000, interval: MIN }, NOW)).toBe('fresh');
  });

  it('returns stale when err is true but cached data is present', () => {
    expect(sourceFreshness({ hasData: true, err: true, lastOk: NOW - 5_000, interval: MIN }, NOW)).toBe('stale');
  });

  it('returns stale when content age exceeds contentMaxMs (chain block clock)', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 5_000, interval: MIN, contentAgeMs: 70 * MIN, contentMaxMs: 60 * MIN }, NOW)).toBe('stale');
  });

  it('returns fresh when content age is within contentMaxMs', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 5_000, interval: MIN, contentAgeMs: 20 * MIN, contentMaxMs: 60 * MIN }, NOW)).toBe('fresh');
  });

  it('ignores content terms when only one of the pair is provided', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 5_000, interval: MIN, contentAgeMs: 999 * MIN }, NOW)).toBe('fresh');
  });

  it('defaults interval to 60000 when absent', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: NOW - 130_000 }, NOW)).toBe('stale');
  });

  it('treats data with missing lastOk as stale (infinite fetch age)', () => {
    expect(sourceFreshness({ hasData: true, err: false, lastOk: null, interval: MIN }, NOW)).toBe('stale');
  });
});
