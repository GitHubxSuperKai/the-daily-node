import { describe, it, expect } from 'vitest';
import {
  HISTORY_GAP_MS, mergeSeries, nearestIndex, pctSince, fmtChipTime,
} from '../../src/utils/chartSeries.js';

const base = new Date(2026, 9, 16, 8, 0).getTime();
const H = (min, usd) => ({ ts: base / 1000 + min * 60, usd });
const C = (min, p) => [base + min * 60000, p];
const minutes = (from, to) => {
  const out = [];
  for (let m = from; m <= to; m++) out.push(H(m, 1000 + m));
  return out;
};

describe('HISTORY_GAP_MS', () => {
  it('is five minutes', () => {
    expect(HISTORY_GAP_MS).toBe(300000);
  });
});

describe('mergeSeries', () => {
  it('history only: converts to ms and sorts', () => {
    expect(mergeSeries([H(2, 20), H(1, 10)], null)).toEqual([
      [base + 60000, 10],
      [base + 120000, 20],
    ]);
  });

  it('chartPts only: passes through, sorted', () => {
    expect(mergeSeries(undefined, [C(2, 20), C(1, 10)])).toEqual([
      [base + 60000, 10],
      [base + 120000, 20],
    ]);
  });

  it('drops CoinGecko points inside dense history coverage', () => {
    const out = mergeSeries(minutes(0, 60), [C(30.5, 99999)]);
    expect(out.some(([, p]) => p === 99999)).toBe(false);
    expect(out).toHaveLength(61);
  });

  it('keeps CoinGecko before first and after last history point', () => {
    const out = mergeSeries(minutes(0, 60), [C(-30, 111), C(90, 222)]);
    expect(out.some(([, p]) => p === 111)).toBe(true);
    expect(out.some(([, p]) => p === 222)).toBe(true);
    for (let i = 1; i < out.length; i++) expect(out[i][0]).toBeGreaterThan(out[i - 1][0]);
  });

  it('fills a history gap longer than 5 minutes', () => {
    const hist = [...minutes(0, 10), ...minutes(30, 40)];
    const out = mergeSeries(hist, [C(20, 777), C(5.5, 888)]);
    expect(out.some(([, p]) => p === 777)).toBe(true);
    expect(out.some(([, p]) => p === 888)).toBe(false);
  });

  it('a gap of exactly 5 minutes is covered', () => {
    const out = mergeSeries([H(0, 10), H(5, 20)], [C(3, 555)]);
    expect(out.some(([, p]) => p === 555)).toBe(false);
  });

  it('history wins on identical timestamp', () => {
    const out = mergeSeries([H(0, 10)], [C(0, 99)]);
    expect(out).toEqual([[base, 10]]);
  });

  it('drops malformed rows without throwing', () => {
    const out = mergeSeries(
      [{ ts: 'x', usd: 1 }, { ts: 1, usd: NaN }, null, { ts: '1792185600', usd: 5 }],
      [[NaN, 1], null, [1, NaN], 'bad'],
    );
    expect(out).toEqual([[1792185600000, 5]]);
    expect(mergeSeries('nope', { a: 1 })).toEqual([]);
  });

  it('both empty: returns []', () => {
    expect(mergeSeries([], [])).toEqual([]);
    expect(mergeSeries(null, null)).toEqual([]);
  });
});

describe('nearestIndex', () => {
  const s = [[1000, 1], [2000, 2], [4000, 3]];

  it('empty series returns -1', () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('single point returns 0 for any t', () => {
    expect(nearestIndex([[1000, 1]], -50)).toBe(0);
    expect(nearestIndex([[1000, 1]], 99999)).toBe(0);
  });

  it('picks the closest point', () => {
    expect(nearestIndex(s, 1900)).toBe(1);
    expect(nearestIndex(s, 3500)).toBe(2);
  });

  it('mid-way tie goes to the earlier index', () => {
    expect(nearestIndex(s, 1500)).toBe(0);
    expect(nearestIndex(s, 3000)).toBe(1);
  });

  it('clamps outside the range', () => {
    expect(nearestIndex(s, 0)).toBe(0);
    expect(nearestIndex(s, 9000)).toBe(2);
  });
});

describe('pctSince', () => {
  it('computes percent change to live', () => {
    expect(pctSince(80912, 81607)).toBeCloseTo(0.859, 3);
  });

  it('returns null for zero or non-finite inputs', () => {
    expect(pctSince(0, 1)).toBeNull();
    expect(pctSince(1, NaN)).toBeNull();
    expect(pctSince(NaN, 1)).toBeNull();
  });
});

describe('fmtChipTime', () => {
  it('formats same-day time', () => {
    const t = new Date(2026, 9, 16, 8, 16).getTime();
    const now = new Date(2026, 9, 16, 14, 0).getTime();
    expect(fmtChipTime(t, now)).toBe('8:16 AM');
  });

  it('prefixes Yesterday for the previous local day', () => {
    const t = new Date(2026, 9, 15, 20, 5).getTime();
    const now = new Date(2026, 9, 16, 7, 0).getTime();
    expect(fmtChipTime(t, now)).toBe('Yesterday 8:05 PM');
  });
});
