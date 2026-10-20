import { describe, it, expect } from 'vitest';
import { getOnThisDay, BTC_HISTORY } from '../../src/components/OnThisDay.jsx';

describe('BTC_HISTORY', () => {
  it('has at most one entry per calendar date', () => {
    const keys = BTC_HISTORY.map(e => `${e.mo}-${e.d}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('only uses real calendar dates', () => {
    for (const e of BTC_HISTORY) {
      // A leap year, so Feb 29 would count as real.
      const dt = new Date(2024, e.mo - 1, e.d);
      expect(dt.getMonth() + 1, `${e.mo}-${e.d}`).toBe(e.mo);
      expect(dt.getDate(), `${e.mo}-${e.d}`).toBe(e.d);
    }
  });

  it('has a plausible year and text that fits the sidebar', () => {
    for (const e of BTC_HISTORY) {
      expect(Number.isInteger(e.y), `${e.mo}-${e.d}`).toBe(true);
      expect(e.y, `${e.mo}-${e.d}`).toBeGreaterThanOrEqual(1950);
      expect(e.y, `${e.mo}-${e.d}`).toBeLessThanOrEqual(2026);
      expect(e.t.trim().length, `${e.mo}-${e.d}`).toBeGreaterThan(0);
      // Three lines at ~40 characters; the Genesis Block quote runs slightly over and clamps.
      expect(e.t.length, `${e.mo}-${e.d}`).toBeLessThanOrEqual(130);
    }
  });

  it('covers most of the year', () => {
    expect(BTC_HISTORY.length).toBeGreaterThanOrEqual(200);
  });

  it('keeps the dates the verification pass corrected', () => {
    const at = (mo, d) => getOnThisDay(new Date(2025, mo - 1, d))?.t ?? '';
    expect(at(1, 12)).toMatch(/Hal Finney/);
    expect(at(1, 9)).not.toMatch(/Hal Finney/);
    expect(at(4, 20)).toMatch(/Fourth halving/);
    expect(at(6, 9)).toMatch(/El Salvador/);
    expect(at(6, 15)).toMatch(/BlackRock/);
    expect(at(7, 9)).toMatch(/^Second halving/);
    expect(at(8, 24)).toMatch(/SegWit/);
    expect(at(9, 11)).toMatch(/BitPay/);
    // Celsius's petition was entered at 20:10 US Eastern on Jul 13, 2022: Jul 14 UTC.
    expect(at(7, 14)).toMatch(/Celsius/);
    expect(at(7, 13)).toBe('');
  });
});

describe('getOnThisDay', () => {
  it('returns the matching entry on an exact date', () => {
    // Jan 3 is the Genesis Block entry
    const entry = getOnThisDay(new Date(2025, 0, 3)); // month 0 = January
    expect(entry).not.toBeNull();
    expect(entry.mo).toBe(1);
    expect(entry.d).toBe(3);
    expect(entry.t).toMatch(/Genesis Block/);
  });

  it('returns null when no entry matches the date', () => {
    // Jan 1 has no entry in BTC_HISTORY
    const entry = getOnThisDay(new Date(2025, 0, 1));
    expect(entry).toBeNull();
  });

  it('does not return a near-miss entry (wrong day, same month)', () => {
    // Jan 3 entry exists, but Jan 4 should return null
    const entry = getOnThisDay(new Date(2025, 0, 4));
    expect(entry).toBeNull();
  });

  it('matches on month and day regardless of year', () => {
    // Oct 31 is the whitepaper date (2008); any year should match
    const entry2025 = getOnThisDay(new Date(2025, 9, 31)); // month 9 = October
    const entry1999 = getOnThisDay(new Date(1999, 9, 31));
    expect(entry2025).not.toBeNull();
    expect(entry2025.t).toMatch(/whitepaper/i);
    expect(entry1999).not.toBeNull();
    expect(entry1999.mo).toBe(10);
    expect(entry1999.d).toBe(31);
  });

  it('returns null for a date between two entries (not nearest-match)', () => {
    // Jan 12 and Jan 14 are entries; Jan 13 should return null, not the nearest
    expect(getOnThisDay(new Date(2025, 0, 12))).not.toBeNull();
    expect(getOnThisDay(new Date(2025, 0, 14))).not.toBeNull();
    expect(getOnThisDay(new Date(2025, 0, 13))).toBeNull();
  });

  it('returns the Pizza Day entry on May 22', () => {
    const entry = getOnThisDay(new Date(2025, 4, 22)); // month 4 = May
    expect(entry).not.toBeNull();
    expect(entry.mo).toBe(5);
    expect(entry.d).toBe(22);
    expect(entry.t).toMatch(/pizza/i);
  });
});
