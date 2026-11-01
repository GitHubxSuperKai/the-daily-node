import React from 'react';

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { DesktopTicker } from '../../src/components/DesktopTicker.jsx';
import { makeMiner, makeOfflineMiner } from '../fixtures/dashboardProps.js';

const CHAIN = { data: null };

// The props useBitaxe emits: a failed fetch keeps the last good list and sets
// fetchFailed (tests/unit/useBitaxe.test.js pins that); a success clears it.
const OK     = { miners: [makeMiner()], err: false, fetchFailed: false, loading: false };
const FAILED = { ...OK, err: true, fetchFailed: true };

function ticker(bitaxe) {
  return <ThemeCtx.Provider value={LIGHT}><DesktopTicker chain={CHAIN} bitaxe={bitaxe} feedHealth="live" /></ThemeCtx.Provider>;
}

// The track renders every item twice (a/b copies) for the seamless scroll.
const fleetItems = () => screen.getAllByText('FLEET').map(k => k.parentElement);

describe('DesktopTicker FLEET stale marker', () => {
  it('marks the FLEET item stale after a failed fetch and clears it after a successful one', () => {
    const { rerender } = render(ticker(OK));
    expect(screen.queryByText(/stale/i)).toBeNull();

    rerender(ticker(FAILED));
    const items = fleetItems();
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.textContent).toMatch(/^FLEETstale · /);
      // The retained list is still shown, not blanked.
      expect(item.textContent).toMatch(/TH\/s/);
    }
    // Only the FLEET item carries it.
    expect(screen.getAllByText(/stale/i)).toHaveLength(2);

    rerender(ticker(OK));
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it('does not mark an all-offline fleet from a successful fetch stale', () => {
    render(ticker({ ...OK, miners: [makeOfflineMiner()], err: true }));
    expect(fleetItems()[0].textContent).toMatch(/offline/);
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it('does not mark stale when a failed fetch has no retained list', () => {
    render(ticker({ ...FAILED, miners: [] }));
    expect(screen.queryByText(/stale/i)).toBeNull();
  });
});
