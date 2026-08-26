import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { makeProps } from '../../fixtures/dashboardProps.js';
import { MobileApp } from '../../../src/components/mobile/MobileApp.jsx';

// Shared with the desktop suite so the two cannot drift. The previous local
// copy carried three shapes no hook produces: feedHealth as an object,
// btc.data.changePct (real field: chgPct), and chain.data.fastFee (real: feeFast).
const baseProps = makeProps();

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('MobileApp', () => {
  it('starts on Home tab', () => {
    wrap(<MobileApp {...baseProps} />);
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  it('switches to Bitcoin panel when Bitcoin tab clicked', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /bitcoin/i }));
    expect(screen.getByText(/Field Report/i)).toBeDefined();
  });

  it('switches to News panel when News tab clicked', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }));
    expect(screen.getByText('Top story')).toBeDefined();
  });

  it('HomePanel tile-click navigates to bitcoin tab', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByTestId('btc-tile'));
    expect(screen.getByText(/Field Report/i)).toBeDefined();
  });

  it('switches to Miners panel when Miners tab clicked', () => {
    wrap(<MobileApp {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /^miners$/i }));
    expect(screen.getByText(/Fleet/i)).toBeDefined();
  });

  it('swipe left from Home navigates to Bitcoin', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(screen.getByText(/Field Report/i)).toBeDefined();
  });

  it('swipe right at home (leftmost tab) is a no-op', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 300, clientY: 205 }] });
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  it('vertical swipe does not change tab', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 210, clientY: 250 }] });
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });
});
