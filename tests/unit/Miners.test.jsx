import React from 'react';

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import Miners from '../../src/components/Miners.jsx';
import { makeMiner, makeOfflineMiner } from '../fixtures/dashboardProps.js';

// chain.data stays null so there are no odds to fit: the hero's measuring effect,
// which calls document.fonts (absent in jsdom), never runs.
const CHAIN = { data: null };

function wrap(bitaxe) {
  return render(
    <ThemeCtx.Provider value={LIGHT}>
      <Miners bitaxe={{ loading: false, err: false, fetchFailed: false, ...bitaxe }} chain={CHAIN} />
    </ThemeCtx.Provider>,
  );
}

describe('Miners', () => {
  it('keeps showing the last good fleet, marked stale, when a fetch fails', () => {
    // useBitaxe keeps the last good list on a failed fetch; the sidebar, ticker
    // and mobile panel all show it, so the desktop section must not blank.
    wrap({ miners: [makeMiner()], err: true, fetchFailed: true });
    expect(screen.getByText(makeMiner().data.hostname)).toBeDefined();
    expect(screen.queryByText(/no miners connected/i)).toBeNull();
    expect(screen.getByText(/stale/i)).toBeDefined();
  });

  it('shows the no-miners state when there is no list', () => {
    wrap({ miners: [], err: true, fetchFailed: true });
    expect(screen.getByText(/no miners connected/i)).toBeDefined();
  });

  it('shows the no-miners state for a successful empty fetch', () => {
    wrap({ miners: [] });
    expect(screen.getByText(/no miners connected/i)).toBeDefined();
  });

  it('shows nothing while the first fetch is still loading', () => {
    wrap({ miners: [], loading: true });
    expect(screen.queryByText(/no miners connected/i)).toBeNull();
  });

  it('lists an all-offline fleet as offline rigs, not as no miners', () => {
    // useBitaxe sets err when every miner is offline, but the fetch worked: the
    // rigs are known and down, so list them, and do not call the data stale.
    wrap({
      miners: [makeOfflineMiner({ ip: '10.0.0.3' }), makeOfflineMiner({ ip: '10.0.0.5' })],
      err: true,
      fetchFailed: false,
    });
    expect(screen.queryByText(/no miners connected/i)).toBeNull();
    expect(screen.getByText('0/2 active')).toBeDefined();
    expect(screen.getByText(/no rigs online/)).toBeDefined();
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it('does not mark a healthy fleet stale', () => {
    wrap({ miners: [makeMiner()] });
    expect(screen.getByText('1/1 active')).toBeDefined();
    expect(screen.queryByText(/stale/i)).toBeNull();
  });

  it('marks the fleet stale after a failed fetch and clears it after a successful one', () => {
    const view = (fetchFailed) => (
      <ThemeCtx.Provider value={LIGHT}>
        <Miners bitaxe={{ miners: [makeMiner()], loading: false, err: fetchFailed, fetchFailed }} chain={CHAIN} />
      </ThemeCtx.Provider>
    );
    const { rerender } = render(view(false));
    expect(screen.queryByText(/stale/i)).toBeNull();
    rerender(view(true));
    expect(screen.getByText(/stale/i).parentElement.textContent).toBe('stale · 1/1 active');
    rerender(view(false));
    expect(screen.queryByText(/stale/i)).toBeNull();
  });
});
