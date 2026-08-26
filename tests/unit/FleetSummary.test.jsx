import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { FleetSummary } from '../../src/components/FleetSummary.jsx';
import { makeMiner } from '../fixtures/dashboardProps.js';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

// Miners come from the shared fixture so this suite cannot drift from the shape
// bitaxe_api.py actually serves; tests/unit/fixtureContract.test.js pins that shape
// to the fields production reads. `data` overrides merge into the fixture defaults,
// and `undefined` deletes a field — which is how a miner that reports no uptime is
// modelled here, matching firmware that omits the key rather than sending null.

describe('FleetSummary uptime cell', () => {
  it('reports the SHORTEST run in the fleet, not the average', () => {
    // 4 days and 6h10m: an average would read ~2d 3h and hide the recent reboot
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: 345600 } }),
      makeMiner({ ip: '10.0.0.2', data: { hashRate: 1200000, power: 200, uptimeSeconds: 22200 } }),
    ]} />);
    expect(screen.getByText('≥6h 10m')).toBeDefined();
  });

  it('marks the value as a floor so a minimum cannot be misread as a fleet-wide run', () => {
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: 354600 } }),
    ]} />);
    expect(screen.getByText('≥4d 2h')).toBeDefined();
  });

  it('never renders uptime as a percentage', () => {
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: 345600 } }),
    ]} />);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('excludes miners reporting no uptime instead of counting them as zero', () => {
    // the pre-fix average coerced a null uptime to 0, dragging the fleet figure down
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: 345600 } }),
      makeMiner({ ip: '10.0.0.2', data: { hashRate: 1200000, power: 200, uptimeSeconds: undefined } }),
    ]} />);
    expect(screen.getByText('≥4d 0h')).toBeDefined();
  });

  it('falls back to an em-dash when no active miner reports uptime', () => {
    // The count is the discriminator: makeMiner always supplies vrTemp, so the VR°
    // cell renders a number and the ONE em-dash on screen has to be the uptime cell.
    // Drop vrTemp too and that cell dashes as well, making the assertion pass against
    // the old "0%" bug.
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: undefined } }),
    ]} />);
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('ignores unreachable miners when picking the minimum', () => {
    // An offline miner that still carries data — not makeOfflineMiner(). The guard
    // under test is the activeMiners filter, which only bites when `data` survives
    // alongside online:false. bitaxe_api.py omits `data` entirely on failure, so this
    // is defensive-only, and a fixture without data is dropped by the null filter
    // instead, leaving the guard unexercised.
    wrap(<FleetSummary miners={[
      makeMiner({ ip: '10.0.0.1', data: { hashRate: 1200000, power: 200, uptimeSeconds: 345600 } }),
      makeMiner({ ip: '10.0.0.2', online: false, data: { hashRate: 0, power: 0, uptimeSeconds: 60 } }),
    ]} />);
    expect(screen.getByText('≥4d 0h')).toBeDefined();
  });
});
