import { describe, it, expect } from 'vitest';
import {
  fmtNum, fmtPrice, fmtPct, fmtVolUsd, fmtBlockTime, fmtHashrate,
  fmtDiff, fmtMempoolMB, fmtBlockSize, timeAgo, timeAgoUnix,
  fmtHour, fmtHHMM, nextHalving, circulatingBTC, calcSoloOdds,
  wmoDesc, wmoIcon, wmoSpeed, fmtBestDiff, classifyTopic,
} from '../../src/utils/formatting.js';

describe('fmtNum', () => {
  it('formats integers with thousands separators', () => {
    expect(fmtNum(1234567)).toBe('1,234,567');
  });
  it('respects decimals arg', () => {
    expect(fmtNum(3.14159, 2)).toBe('3.14');
  });
  it('returns em-dash for null/NaN', () => {
    expect(fmtNum(null)).toBe('—');
    expect(fmtNum(NaN)).toBe('—');
  });
});

describe('fmtPrice', () => {
  it('rounds to integer with separators', () => {
    expect(fmtPrice(67891.23)).toBe('67,891');
  });
  it('returns em-dash for null', () => {
    expect(fmtPrice(null)).toBe('—');
  });
});

describe('fmtPct', () => {
  it('prefixes positive values with +', () => {
    expect(fmtPct(2.5)).toBe('+2.50');
  });
  it('keeps native sign for negatives', () => {
    expect(fmtPct(-1.234)).toBe('-1.23');
  });
  it('returns em-dash for null', () => {
    expect(fmtPct(null)).toBe('—');
  });
});

describe('fmtVolUsd', () => {
  it('formats billions with B suffix', () => {
    expect(fmtVolUsd(2.5e9)).toBe('$2.5B');
  });
  it('formats millions with M suffix', () => {
    expect(fmtVolUsd(150e6)).toBe('$150M');
  });
  it('returns em-dash for null', () => {
    expect(fmtVolUsd(null)).toBe('—');
  });
});

describe('fmtBlockTime', () => {
  it('converts ms to "Xm Ys"', () => {
    expect(fmtBlockTime(125_000)).toBe('2m 5s');
  });
});

describe('fmtHashrate', () => {
  it('shows EH/s when >= 1 EH/s', () => {
    expect(fmtHashrate(600e18)).toBe('600 EH/s');
  });
  it('shows PH/s when < 1 EH/s', () => {
    expect(fmtHashrate(500e15)).toBe('500.0 PH/s');
  });
});

describe('fmtDiff', () => {
  it('formats trillions with T', () => {
    expect(fmtDiff(95e12)).toBe('95.0 T');
  });
  it('formats billions with B', () => {
    expect(fmtDiff(2.5e9)).toBe('2.5 B');
  });
});

describe('fmtMempoolMB', () => {
  it('returns "0 MB" for zero', () => {
    expect(fmtMempoolMB(0)).toBe('0 MB');
  });
  it('formats < 100 MB with one decimal', () => {
    expect(fmtMempoolMB(45e6)).toBe('45.0 MB');
  });
  it('rounds > 100 MB to integer', () => {
    expect(fmtMempoolMB(250e6)).toBe('250 MB');
  });
  it('formats exactly 100 MB with one decimal (boundary: condition is > 100, not >=)', () => {
    expect(fmtMempoolMB(100e6)).toBe('100.0 MB');
  });
});

describe('fmtBlockSize', () => {
  it('returns em-dash for falsy', () => {
    expect(fmtBlockSize(0)).toBe('—');
  });
  it('shows MB for >= 1 MB', () => {
    expect(fmtBlockSize(1.5e6)).toBe('1.50 MB');
  });
  it('shows kB for < 1 MB', () => {
    expect(fmtBlockSize(500_000)).toBe('500 kB');
  });
});

describe('timeAgo', () => {
  it('returns "just now" for future or zero diff', () => {
    const future = new Date(Date.now() + 10000).toISOString();
    expect(timeAgo(future)).toBe('just now');
  });
  it('returns seconds ago', () => {
    const ts = new Date(Date.now() - 30000).toISOString();
    expect(timeAgo(ts)).toBe('30s ago');
  });
  it('returns minutes ago', () => {
    const ts = new Date(Date.now() - 600000).toISOString();
    expect(timeAgo(ts)).toBe('10m ago');
  });
  it('returns hours ago', () => {
    const ts = new Date(Date.now() - 7200000).toISOString();
    expect(timeAgo(ts)).toBe('2h ago');
  });
  it('returns days ago', () => {
    const ts = new Date(Date.now() - 172800000).toISOString();
    expect(timeAgo(ts)).toBe('2d ago');
  });
});

describe('timeAgoUnix', () => {
  it('returns seconds for < 60s ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 30;
    expect(timeAgoUnix(ts)).toBe('30s ago');
  });
  it('returns minutes for < 1h ago', () => {
    const ts = Math.floor(Date.now() / 1000) - 600;
    expect(timeAgoUnix(ts)).toBe('10m ago');
  });
});

describe('fmtHour', () => {
  it('formats 24h with leading zero', () => {
    expect(fmtHour(7, '24h')).toBe('07:00');
  });
  it('formats 12am for hour 0', () => {
    expect(fmtHour(0, '12h')).toBe('12am');
  });
  it('formats 12pm for hour 12', () => {
    expect(fmtHour(12, '12h')).toBe('12pm');
  });
  it('formats 3pm for hour 15', () => {
    expect(fmtHour(15, '12h')).toBe('3pm');
  });
});

describe('fmtHHMM', () => {
  it('passes through 24h format', () => {
    expect(fmtHHMM('18:30', '24h')).toBe('18:30');
  });
  it('converts to 12h with am/pm', () => {
    expect(fmtHHMM('18:30', '12h')).toBe('6:30pm');
    expect(fmtHHMM('00:05', '12h')).toBe('12:05am');
  });
  it('returns empty string for falsy', () => {
    expect(fmtHHMM('', '24h')).toBe('');
  });
});

describe('nextHalving', () => {
  it('returns ISO date string', () => {
    const d = nextHalving(800_000);
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('circulatingBTC', () => {
  it('returns formatted supply string for current heights', () => {
    const s = circulatingBTC(840_000);
    expect(s).toMatch(/^\d{2}\.\d{2}M BTC$/);
  });
});

describe('calcSoloOdds', () => {
  it('returns null on missing inputs', () => {
    expect(calcSoloOdds(null, 1)).toBeNull();
    expect(calcSoloOdds(600, 0)).toBeNull();
  });
  it('returns shape {oddsPerDay, etaYears} for valid inputs', () => {
    const r = calcSoloOdds(600, 1);  // 600 EH/s network, 1 TH/s miner
    expect(r).toHaveProperty('oddsPerDay');
    expect(r).toHaveProperty('etaYears');
    expect(r.oddsPerDay).toBeGreaterThan(0);
  });
});

describe('wmoDesc', () => {
  it('maps known codes', () => {
    expect(wmoDesc(0)).toBe('Clear sky');
    expect(wmoDesc(95)).toBe('Thunderstorm');
  });
  it('returns Unknown for unmapped codes', () => {
    expect(wmoDesc(999)).toBe('Unknown');
  });
});

describe('wmoIcon', () => {
  it('returns clear-day for code 0 in daytime', () => {
    expect(wmoIcon(0, 12, 5, 6, 20)).toBe('clear-day');
  });
  it('returns clear-night for code 0 at night', () => {
    expect(wmoIcon(0, 22, 5, 6, 20)).toBe('clear-night');
  });
  it('returns wind override for code 1 at high wind speed', () => {
    expect(wmoIcon(1, 12, 30, 6, 20)).toBe('wind');
  });
  it('returns wind override for code 2 (partly cloudy) at high wind speed', () => {
    expect(wmoIcon(2, 12, 30, 6, 20)).toBe('wind');
  });
  it('returns thunderstorms for code >= 95', () => {
    expect(wmoIcon(95, 12, 5, 6, 20)).toBe('thunderstorms');
  });
  it('returns snow for snow codes', () => {
    expect(wmoIcon(73, 12, 5, 6, 20)).toBe('snow');
  });
});

describe('wmoSpeed', () => {
  it('returns slower number for clear sky', () => {
    expect(wmoSpeed(0, 5)).toBe(3.0);
  });
  it('scales wind faster as mph rises', () => {
    const slow = wmoSpeed(1, 25);
    const fast = wmoSpeed(1, 60);
    expect(fast).toBeLessThan(slow);
  });
  it('returns fast value for thunderstorm', () => {
    expect(wmoSpeed(95, 0)).toBeLessThanOrEqual(0.8);
  });
});

describe('fmtBestDiff', () => {
  it('returns em-dash for falsy/zero', () => {
    expect(fmtBestDiff(0)).toBe('—');
    expect(fmtBestDiff(null)).toBe('—');
  });
  it('formats trillions with T suffix', () => {
    expect(fmtBestDiff(2.5e12)).toBe('2.50T');
  });
  it('formats billions with G suffix', () => {
    expect(fmtBestDiff(1.5e9)).toBe('1.50G');
  });
  it('formats millions with M suffix', () => {
    expect(fmtBestDiff(3.75e6)).toBe('3.75M');
  });
  it('formats thousands with K suffix', () => {
    expect(fmtBestDiff(2500)).toBe('2.5K');
  });
  it('returns raw number as string for < 1000', () => {
    expect(fmtBestDiff(42)).toBe('42');
  });
});

describe('classifyTopic', () => {
  it('returns BREAKING for breaking/urgent headlines', () => {
    expect(classifyTopic('Breaking: Bitcoin hits new ATH')).toBe('BREAKING');
  });
  it('returns MARKETS for price/market headlines', () => {
    expect(classifyTopic('Bitcoin ETF inflows hit record')).toBe('MARKETS');
    expect(classifyTopic('BTC price rally continues')).toBe('MARKETS');
  });
  it('returns MINING for mining headlines', () => {
    expect(classifyTopic('Hashrate reaches all-time high')).toBe('MINING');
    expect(classifyTopic('Antpool mines record block')).toBe('MINING');
  });
  it('returns REGULATION for regulatory headlines', () => {
    expect(classifyTopic('IRS targets Bitcoin tax evaders')).toBe('REGULATION');
    expect(classifyTopic('Congress debates crypto law')).toBe('REGULATION');
  });
  it('returns TECH for protocol/tech headlines', () => {
    expect(classifyTopic('New Lightning Network upgrade shipped')).toBe('TECH');
    expect(classifyTopic('Taproot adoption grows')).toBe('TECH');
  });
  it('returns GLOBAL for sovereign/nation headlines', () => {
    expect(classifyTopic('El Salvador adds to strategic reserve')).toBe('GLOBAL');
  });
  it('returns BITCOIN as default for unmatched headlines', () => {
    expect(classifyTopic('Something happened today')).toBe('BITCOIN');
    expect(classifyTopic('')).toBe('BITCOIN');
  });
});
