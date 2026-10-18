import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { MinerRow } from '../../src/components/MinerRow.jsx';
import { makeMiner, makeOfflineMiner } from '../fixtures/dashboardProps.js';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}><div>{ui}</div></ThemeCtx.Provider>);
}

describe('MinerRow firmware badge', () => {
  it('shows an update badge when the miner runs an older release', () => {
    wrap(<MinerRow miner={makeMiner({ data: { version: 'v2.14.0' } })} latestFirmware="v2.15.3" isLast />);
    const badge = screen.getByText('UPDATE');
    expect(badge.getAttribute('title')).toBe('Firmware v2.14.0 → v2.15.3 available');
  });

  it.each([
    ['the miner is current', 'v2.15.3', 'v2.15.3'],
    ['the miner reports "Unknown"', 'Unknown', 'v2.15.3'],
    ['the miner omits version', undefined, 'v2.15.3'],
    ['the latest release is unknown', 'v2.14.0', null],
  ])('shows no badge when %s', (_label, version, latest) => {
    wrap(<MinerRow miner={makeMiner({ data: { version } })} latestFirmware={latest} isLast />);
    expect(screen.queryByText('UPDATE')).toBeNull();
  });

  it('shows no badge for an offline miner', () => {
    wrap(<MinerRow miner={makeOfflineMiner()} latestFirmware="v2.15.3" isLast />);
    expect(screen.queryByText('UPDATE')).toBeNull();
  });
});
