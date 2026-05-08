import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkFeeThreshold,
  checkBlockTimeThreshold,
  checkMinerOfflineThreshold,
  checkPriceThreshold,
} from '../../src/utils/alertThresholds.js';

describe('checkFeeThreshold', () => {
  it('returns true when fee > threshold', () => {
    expect(checkFeeThreshold(51, 50)).toBe(true);
  });
  it('returns false when fee equals threshold', () => {
    expect(checkFeeThreshold(50, 50)).toBe(false);
  });
  it('returns false for null fee', () => {
    expect(checkFeeThreshold(null, 50)).toBe(false);
  });
  it('returns false for null threshold', () => {
    expect(checkFeeThreshold(51, null)).toBe(false);
  });
});

describe('checkBlockTimeThreshold', () => {
  it('returns true when ms since last block > 15 min', () => {
    expect(checkBlockTimeThreshold(16 * 60 * 1000)).toBe(true);
  });
  it('returns false at exactly 15 min', () => {
    expect(checkBlockTimeThreshold(15 * 60 * 1000)).toBe(false);
  });
  it('returns false for null', () => {
    expect(checkBlockTimeThreshold(null)).toBe(false);
  });
});

describe('checkMinerOfflineThreshold', () => {
  it('returns true when at least one miner is offline', () => {
    expect(checkMinerOfflineThreshold(1)).toBe(true);
  });
  it('returns false when count is 0', () => {
    expect(checkMinerOfflineThreshold(0)).toBe(false);
  });
  it('returns false for null', () => {
    expect(checkMinerOfflineThreshold(null)).toBe(false);
  });
});

describe('checkPriceThreshold', () => {
  let now;
  beforeEach(() => {
    now = 1700000000;
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns true when price moved >= pctThreshold within window', () => {
    const history = [{ ts: now - 30 * 60, usd: 50000 }];
    expect(checkPriceThreshold(53000, history, 5, 60 * 60)).toBe(true);
  });
  it('returns false when price moved < pctThreshold', () => {
    const history = [{ ts: now - 30 * 60, usd: 50000 }];
    expect(checkPriceThreshold(51000, history, 5, 60 * 60)).toBe(false);
  });
  it('handles price drop (negative move)', () => {
    const history = [{ ts: now - 30 * 60, usd: 50000 }];
    expect(checkPriceThreshold(47000, history, 5, 60 * 60)).toBe(true);
  });
  it('returns false when no history point within window', () => {
    const history = [{ ts: now - 2 * 60 * 60, usd: 50000 }];
    expect(checkPriceThreshold(53000, history, 5, 60 * 60)).toBe(false);
  });
  it('returns false for empty history', () => {
    expect(checkPriceThreshold(53000, [], 5, 60 * 60)).toBe(false);
  });
  it('returns false for non-number price', () => {
    const history = [{ ts: now - 30 * 60, usd: 50000 }];
    expect(checkPriceThreshold(null, history, 5, 60 * 60)).toBe(false);
  });
});
