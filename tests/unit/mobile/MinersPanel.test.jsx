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

const chainWithHashrate = {
  data: { hashrate: 5e18 },
};

const minersWithPower = {
  miners: [
    { ip: '10.0.0.1', online: true,  data: { hostname: 'bitaxe-01', hashRate: 5000, temp: 62, power: 200 } },
    { ip: '10.0.0.2', online: false, data: null },
  ],
};

describe('MinersPanel — efficiency and solo stats', () => {
  it('renders fleet efficiency in J/TH', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('40.0 J/TH')).toBeDefined();
  });

  it('renders solo odds', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('1:6,944/d')).toBeDefined();
  });

  it('renders ETA years', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={chainWithHashrate} />);
    expect(screen.getByText('~19 yrs')).toBeDefined();
  });

  it('efficiency section hidden when no miners online', () => {
    const noOnline = { miners: [{ ip: '10.0.0.1', online: false, data: null }] };
    wrap(<MinersPanel bitaxe={noOnline} chain={chainWithHashrate} />);
    expect(screen.queryByText(/J\/TH/)).toBeNull();
  });

  it('solo odds hidden when chain.data is null', () => {
    wrap(<MinersPanel bitaxe={minersWithPower} chain={{ data: null }} />);
    // Efficiency still shows (local calc); solo odds require chain.data
    expect(screen.getByText('40.0 J/TH')).toBeDefined();
    expect(screen.queryByText(/\/d/)).toBeNull();
  });

  it('existing tests still pass when chain prop omitted', () => {
    wrap(<MinersPanel bitaxe={{ miners: [] }} />);
    expect(screen.getByText(/no miners configured/i)).toBeDefined();
  });
});

describe('MinersPanel — per-miner secondary stats row', () => {
  const minerWithStats = {
    miners: [
      {
        ip: '10.0.0.1',
        online: true,
        data: {
          hostname: 'bitaxe-01',
          hashRate: 1200000,
          temp: 62,
          power: 200,
          uptimeSeconds: 72000,
          sharesAccepted: 500,
          sharesRejected: 2,
        },
      },
    ],
  };

  it('shows power, uptime, and shares in secondary stats row', () => {
    wrap(<MinersPanel bitaxe={minerWithStats} />);
    expect(screen.getByText('200W')).toBeDefined();
    expect(screen.getByText('20h 0m up')).toBeDefined();
    expect(screen.getByText('500/2')).toBeDefined();
  });

  it('renders multi-day uptime as a duration, never as a >100% figure', () => {
    const fourDays = {
      miners: [{
        ip: '10.0.0.2',
        online: true,
        data: { hostname: 'bitaxe-02', hashRate: 1200000, temp: 62, uptimeSeconds: 354600 },
      }],
    };
    wrap(<MinersPanel bitaxe={fourDays} />);
    expect(screen.getByText('4d 2h up')).toBeDefined();
    // no percentage in any form — the clamped "99% up" is just as wrong as "400% up"
    expect(screen.queryByText(/% up/)).toBeNull();
  });
});
