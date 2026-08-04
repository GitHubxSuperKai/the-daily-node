import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { FleetSummary } from '../../src/components/FleetSummary.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

function miner(ip, data) {
  return { ip, online: data != null, data };
}

describe('FleetSummary uptime cell', () => {
  it('reports the SHORTEST run in the fleet, not the average', () => {
    // 4 days and 6h10m: an average would read ~2d 3h and hide the recent reboot
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200, uptimeSeconds: 345600 }),
      miner('10.0.0.2', { hashRate: 1200000, power: 200, uptimeSeconds: 22200 }),
    ]} />);
    expect(screen.getByText('≥6h 10m')).toBeDefined();
  });

  it('marks the value as a floor so a minimum cannot be misread as a fleet-wide run', () => {
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200, uptimeSeconds: 354600 }),
    ]} />);
    expect(screen.getByText('≥4d 2h')).toBeDefined();
  });

  it('never renders uptime as a percentage', () => {
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200, uptimeSeconds: 345600 }),
    ]} />);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('excludes miners reporting no uptime instead of counting them as zero', () => {
    // the pre-fix average coerced a null uptime to 0, dragging the fleet figure down
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200, uptimeSeconds: 345600 }),
      miner('10.0.0.2', { hashRate: 1200000, power: 200 }),
    ]} />);
    expect(screen.getByText('≥4d 0h')).toBeDefined();
  });

  it('falls back to an em-dash when no active miner reports uptime', () => {
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200 }),
    ]} />);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('ignores unreachable miners when picking the minimum', () => {
    wrap(<FleetSummary miners={[
      miner('10.0.0.1', { hashRate: 1200000, power: 200, uptimeSeconds: 345600 }),
      miner('10.0.0.2', null),
    ]} />);
    expect(screen.getByText('≥4d 0h')).toBeDefined();
  });
});
