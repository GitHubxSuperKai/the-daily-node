import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { MinersPanel } from '../../../src/components/mobile/MinersPanel.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const twoMiners = {
  miners: [
    { ip: '10.0.0.1', online: true,  data: { hostname: 'bitaxe-01', hashRate: 1200000, temp: 62 } },
    { ip: '10.0.0.2', online: false, data: null },
  ],
};

describe('MinersPanel', () => {
  it('shows fleet summary line', () => {
    wrap(<MinersPanel bitaxe={twoMiners} />);
    expect(screen.getByText(/1\/2 online/i)).toBeDefined();
  });

  it('shows per-miner hostname for online miner', () => {
    wrap(<MinersPanel bitaxe={twoMiners} />);
    expect(screen.getByText('bitaxe-01')).toBeDefined();
  });

  it('shows hashrate in TH/s and temp for online miner', () => {
    wrap(<MinersPanel bitaxe={twoMiners} />);
    expect(screen.getByText(/1200\.0 TH\/s/)).toBeDefined();
    expect(screen.getByText(/62°C/)).toBeDefined();
  });

  it('shows offline status for offline miner', () => {
    wrap(<MinersPanel bitaxe={twoMiners} />);
    expect(screen.getByText('offline')).toBeDefined();
  });

  it('shows empty state when no miners configured', () => {
    wrap(<MinersPanel bitaxe={{ miners: [] }} />);
    expect(screen.getByText(/no miners configured/i)).toBeDefined();
  });
});
