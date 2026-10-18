import { describe, it, expect } from 'vitest';
import { parseFirmwareVersion, isFirmwareOutdated } from '../../src/utils/firmware.js';

describe('parseFirmwareVersion', () => {
  it('parses a v-prefixed release tag', () => {
    expect(parseFirmwareVersion('v2.15.3')).toEqual([2, 15, 3]);
  });

  it('parses a bare version', () => {
    expect(parseFirmwareVersion('2.4.0')).toEqual([2, 4, 0]);
  });

  it('keeps only the numeric core of a suffixed version', () => {
    expect(parseFirmwareVersion('v2.16.0-rc1')).toEqual([2, 16, 0]);
    expect(parseFirmwareVersion('v2.15.0-12-gabcdef')).toEqual([2, 15, 0]);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseFirmwareVersion('  v2.15.3 ')).toEqual([2, 15, 3]);
  });

  it.each([
    ['the firmware "Unknown" fallback', 'Unknown'],
    ['an empty string', ''],
    ['two components only', 'v2.15'],
    ['a leading-garbage string', 'build-2.15.3'],
    ['a number', 2.15],
    ['null', null],
    ['undefined', undefined],
    ['an object', { version: 'v2.15.3' }],
  ])('returns null for %s', (_label, value) => {
    expect(parseFirmwareVersion(value)).toBeNull();
  });
});

describe('isFirmwareOutdated', () => {
  it('is true when the miner core is older than the latest release', () => {
    expect(isFirmwareOutdated('v2.14.0', 'v2.15.3')).toBe(true);
    expect(isFirmwareOutdated('v2.15.2', 'v2.15.3')).toBe(true);
    expect(isFirmwareOutdated('v1.99.99', 'v2.0.0')).toBe(true);
  });

  it('compares components numerically, not as strings', () => {
    expect(isFirmwareOutdated('v2.9.0', 'v2.15.0')).toBe(true);
    expect(isFirmwareOutdated('v2.15.0', 'v2.9.0')).toBe(false);
  });

  it('is false when the miner runs the latest release', () => {
    expect(isFirmwareOutdated('v2.15.3', 'v2.15.3')).toBe(false);
    expect(isFirmwareOutdated('2.15.3', 'v2.15.3')).toBe(false);
  });

  it('is false when the cores match but the miner carries a suffix', () => {
    // An rc of the latest, or a dev build past it: neither warrants an update badge.
    expect(isFirmwareOutdated('v2.15.3-rc1', 'v2.15.3')).toBe(false);
    expect(isFirmwareOutdated('v2.15.3-4-gabc123', 'v2.15.3')).toBe(false);
  });

  it('flags a git-describe build whose core is behind the latest', () => {
    expect(isFirmwareOutdated('v2.15.0-12-gabcdef', 'v2.15.3')).toBe(true);
  });

  it('is false when the miner is ahead of the latest release', () => {
    expect(isFirmwareOutdated('v2.16.0-rc1', 'v2.15.3')).toBe(false);
  });

  it.each([
    ['missing miner version', undefined, 'v2.15.3'],
    ['"Unknown" miner version', 'Unknown', 'v2.15.3'],
    ['unknown latest', 'v2.14.0', null],
    ['unparseable latest', 'v2.14.0', 'garbage'],
  ])('is false for %s', (_label, current, latest) => {
    expect(isFirmwareOutdated(current, latest)).toBe(false);
  });
});
