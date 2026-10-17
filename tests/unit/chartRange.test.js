import { describe, it, expect } from 'vitest';
import {
  RANGES, RANGE_KEYS, isRangeKey, resolveRange, normKrakenOHLC,
  windowSeries, axisLabels, chipTime, withRange,
} from '../../src/utils/chartRange.js';
import { fmtChipTime } from '../../src/utils/chartSeries.js';

const END = new Date(2026, 9, 16, 12, 0).getTime();

describe('RANGES', () => {
  it('matches the spec table', () => {
    expect(RANGE_KEYS).toEqual(['1h', '24h', '7d', '30d', '1y']);
    expect(RANGES['1h']).toEqual({ label: '1H', interval: 1, spanMs: 3600000, refreshMs: 60000 });
    expect(RANGES['24h']).toEqual({ label: '24H', interval: 5, spanMs: 86400000, refreshMs: 300000 });
    expect(RANGES['7d']).toEqual({ label: '7D', interval: 60, spanMs: 604800000, refreshMs: 900000 });
    expect(RANGES['30d']).toEqual({ label: '30D', interval: 60, spanMs: 2592000000, refreshMs: 900000 });
    expect(RANGES['1y']).toEqual({ label: '1Y', interval: 1440, spanMs: 31536000000, refreshMs: 3600000 });
  });
});

describe('isRangeKey', () => {
  it('accepts only the five keys', () => {
    for (const k of RANGE_KEYS) expect(isRangeKey(k)).toBe(true);
    expect(isRangeKey('bogus')).toBe(false);
    expect(isRangeKey(undefined)).toBe(false);
    expect(isRangeKey(24)).toBe(false);
  });
});

describe('resolveRange', () => {
  it('falls back to 24h', () => {
    expect(resolveRange({ chart: { range: '7d' } })).toBe('7d');
    expect(resolveRange({ chart: { range: 'bogus' } })).toBe('24h');
    expect(resolveRange({})).toBe('24h');
    expect(resolveRange(undefined)).toBe('24h');
  });
});

describe('normKrakenOHLC', () => {
  it('reads string closes under a non-XBTUSD key and sorts ascending', () => {
    const json = {
      error: [],
      result: {
        XXBTZUSD: [
          [1700000060, '1', '2', '0.5', '81669.4', '1', '0.1', 3],
          [1700000000, '1', '2', '0.5', '81000', '1', '0.1', 3],
        ],
        last: 1700000060,
      },
    };
    expect(normKrakenOHLC(json)).toEqual([[1700000000000, 81000], [1700000060000, 81669.4]]);
  });

  it('drops malformed rows', () => {
    const json = {
      error: [],
      result: { XXBTZUSD: [null, 'x', [1, 'a', 'b', 'c', 'NaN'], [NaN, '1', '2', '0.5', '5']], last: 1 },
    };
    expect(normKrakenOHLC(json)).toEqual([]);
  });

  it('drops null, empty and zero closes or times but keeps a valid row', () => {
    const json = {
      error: [],
      result: {
        XXBTZUSD: [
          [1700000000, '1', '2', '0.5', null, '1', '0.1', 3],
          [1700000060, '1', '2', '0.5', '', '1', '0.1', 3],
          [1700000120, '1', '2', '0.5', '0', '1', '0.1', 3],
          [null, '1', '2', '0.5', '81000', '1', '0.1', 3],
          ['', '1', '2', '0.5', '81000', '1', '0.1', 3],
          [1700000180, '1', '2', '0.5', '81500', '1', '0.1', 3],
        ],
        last: 1700000180,
      },
    };
    expect(normKrakenOHLC(json)).toEqual([[1700000180000, 81500]]);
  });

  it('throws on a Kraken error array or a missing result', () => {
    expect(() => normKrakenOHLC({ error: ['EGeneral:Too many requests'], result: {} })).toThrow('kraken');
    expect(() => normKrakenOHLC({ error: [] })).toThrow('kraken');
  });
});

describe('windowSeries', () => {
  it('keeps the inclusive domain', () => {
    const s = [[0, 1], [10, 2], [20, 3]];
    expect(windowSeries(s, [10, 20])).toEqual([[10, 2], [20, 3]]);
    expect(windowSeries(s, [11, 19])).toEqual([]);
    expect(windowSeries(s, null)).toBe(s);
  });
});

describe('axisLabels', () => {
  it('labels per range', () => {
    expect(axisLabels('1h', END, END)).toEqual(['60m ago', '−45m', '−30m', '−15m', 'now']);
    expect(axisLabels('24h', END, END)).toEqual(['24h ago', '−18h', '−12h', '−6h', 'now']);
    expect(axisLabels('7d', END, END)).toEqual(['Oct 9', 'Oct 11', 'Oct 13', 'Oct 14', 'now']);
    expect(axisLabels('30d', END, END)).toEqual(['Sep 16', 'Sep 24', 'Oct 1', 'Oct 9', 'now']);
    expect(axisLabels('1y', END, END)).toEqual(["Oct '25", "Jan '26", "Apr '26", "Jul '26", 'now']);
  });

  it('1h/24h keep "now" while the edge is at most 15 minutes old', () => {
    expect(axisLabels('1h', END, END + 15 * 60000)).toEqual(['60m ago', '−45m', '−30m', '−15m', 'now']);
    expect(axisLabels('24h', END, END + 15 * 60000)).toEqual(['24h ago', '−18h', '−12h', '−6h', 'now']);
  });

  it('1h/24h label a stale edge with its clock time, not "now" or "ago"', () => {
    const now = END + 15 * 60000 + 1;
    expect(axisLabels('1h', END, now)).toEqual(['−60m', '−45m', '−30m', '−15m', fmtChipTime(END, now)]);
    expect(axisLabels('24h', END, now)).toEqual(['−24h', '−18h', '−12h', '−6h', fmtChipTime(END, now)]);
    expect(axisLabels('1h', END, now)[4]).toBe('12:00 PM');
  });

  it('a stale edge from yesterday reads "Yesterday"', () => {
    expect(axisLabels('24h', END, END + 20 * 3600000)[4]).toBe('Yesterday 12:00 PM');
  });

  it('7d/30d/1y are unchanged by edge age', () => {
    const now = END + 86400000;
    expect(axisLabels('7d', END, now)[4]).toBe('now');
    expect(axisLabels('30d', END, now)[4]).toBe('now');
    expect(axisLabels('1y', END, now)[4]).toBe('now');
  });
});

describe('chipTime', () => {
  it('formats per range', () => {
    const t = new Date(2026, 9, 9, 15, 0).getTime();
    expect(chipTime('7d', t, END)).toBe('Oct 9, 3 PM');
    expect(chipTime('30d', t, END)).toBe('Oct 9, 3 PM');
    expect(chipTime('1y', new Date(2025, 9, 9, 15, 0).getTime(), END)).toBe('Oct 9, 2025');
    expect(chipTime('24h', t, END)).toBe(fmtChipTime(t, END));
    expect(chipTime('1h', t, END)).toBe(fmtChipTime(t, END));
  });
});

describe('withRange', () => {
  it('keeps other keys by identity', () => {
    const p = { mempool: { baseUrl: '' }, alerts: {}, chart: { range: '24h', other: 1 } };
    const q = withRange(p, '7d');
    expect(q.chart).toEqual({ range: '7d', other: 1 });
    expect(q.mempool).toBe(p.mempool);
    expect(q.alerts).toBe(p.alerts);
    expect(p.chart.range).toBe('24h');
  });

  it('creates the chart key when absent', () => {
    expect(withRange({ alerts: {} }, '1y').chart).toEqual({ range: '1y' });
  });
});
