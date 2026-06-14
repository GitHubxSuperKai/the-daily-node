import { describe, it, expect } from 'vitest';
import { getOnThisDay } from '../../src/components/OnThisDay.jsx';

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
    // Jan 2 has no entry in BTC_HISTORY
    const entry = getOnThisDay(new Date(2025, 0, 2));
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
    // Jan 3 and Jan 9 are entries; Jan 5 should return null, not the nearest
    const entry = getOnThisDay(new Date(2025, 0, 5));
    expect(entry).toBeNull();
  });

  it('returns the Pizza Day entry on May 22', () => {
    const entry = getOnThisDay(new Date(2025, 4, 22)); // month 4 = May
    expect(entry).not.toBeNull();
    expect(entry.mo).toBe(5);
    expect(entry.d).toBe(22);
    expect(entry.t).toMatch(/pizza/i);
  });
});
