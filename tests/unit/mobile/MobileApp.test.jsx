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
const baseProps = () => makeProps();

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('MobileApp', () => {
  it('starts on Home tab', () => {
    wrap(<MobileApp {...baseProps()} />);
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  it('switches to Bitcoin panel when Bitcoin tab clicked', () => {
    wrap(<MobileApp {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /bitcoin/i }));
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('switches to News panel when News tab clicked', () => {
    wrap(<MobileApp {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^news$/i }));
    expect(screen.getByText('Top story')).toBeDefined();
  });

  it('HomePanel tile-click navigates to bitcoin tab', () => {
    wrap(<MobileApp {...baseProps()} />);
    fireEvent.click(screen.getByTestId('btc-tile'));
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('switches to Miners panel when Miners tab clicked', () => {
    wrap(<MobileApp {...baseProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /^miners$/i }));
    expect(screen.getByText(/Fleet/i)).toBeDefined();
  });

  it('swipe left from Home navigates to Bitcoin', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps()} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('swipe right at home (leftmost tab) is a no-op', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps()} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 300, clientY: 205 }] });
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  it('vertical swipe does not change tab', () => {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps()} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 210, clientY: 250 }] });
    expect(screen.getByText(/BTC \/ USD/i)).toBeDefined();
  });

  function openBitcoinBySwipe() {
    const { container } = render(
      <ThemeCtx.Provider value={LIGHT}><MobileApp {...baseProps()} /></ThemeCtx.Provider>
    );
    const outer = container.firstChild;
    fireEvent.touchStart(outer, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
    return { container, outer };
  }

  it('swipe that starts on the chart does not change tab', () => {
    const { container, outer } = openBitcoinBySwipe();
    const chart = container.querySelector('[data-chart-scrub]');
    expect(chart).not.toBeNull();
    fireEvent.touchStart(chart, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('a second finger landing off the chart does not re-arm a swipe for the chart finger', () => {
    const { container, outer } = openBitcoinBySwipe();
    const chart = container.querySelector('[data-chart-scrub]');
    const onChart = { clientX: 300, clientY: 200, target: chart };
    fireEvent.touchStart(chart, { touches: [onChart] });
    // e.touches[0] is still the chart finger when the second finger lands elsewhere.
    fireEvent.touchStart(outer, { touches: [onChart, { clientX: 100, clientY: 400, target: outer }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('a third finger landing off the chart does not re-arm a swipe either', () => {
    const { container, outer } = openBitcoinBySwipe();
    const chart = container.querySelector('[data-chart-scrub]');
    const b = { clientX: 5, clientY: 200, target: outer };
    const a = { clientX: 300, clientY: 200, target: chart };
    const c = { clientX: 100, clientY: 400, target: outer };
    fireEvent.touchStart(outer, { touches: [b] });            // B rests off the chart
    fireEvent.touchStart(chart, { touches: [b, a] });         // A lands on the chart
    fireEvent.touchStart(outer, { touches: [b, a, c] });      // C lands off the chart; touches[0] is B
    fireEvent.touchEnd(outer, { touches: [b, c], changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
  });

  it('once every finger has lifted, a fresh swipe off the chart switches tabs again', () => {
    const { container, outer } = openBitcoinBySwipe();
    const chart = container.querySelector('[data-chart-scrub]');
    fireEvent.touchStart(chart, { touches: [{ clientX: 300, clientY: 200, target: chart }] });
    fireEvent.touchEnd(chart, { touches: [], changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.getByText(/^Network Status$/)).toBeDefined();
    fireEvent.touchStart(outer, { touches: [{ clientX: 300, clientY: 200, target: outer }] });
    fireEvent.touchEnd(outer, { touches: [], changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.queryByText(/^Network Status$/)).toBeNull();
  });

  it('range buttons render on the Bitcoin panel outside the chart scrub area', () => {
    const { container } = openBitcoinBySwipe();
    const button = container.querySelector('button[data-range="7d"]');
    expect(button).not.toBeNull();
    expect(button.closest('[data-chart-scrub]')).toBeNull();
  });

  it('a horizontal swipe that starts on a range button still switches tabs', () => {
    const { container, outer } = openBitcoinBySwipe();
    const button = container.querySelector('button[data-range="7d"]');
    fireEvent.touchStart(button, { touches: [{ clientX: 300, clientY: 200, target: button }] });
    fireEvent.touchEnd(outer, { touches: [], changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.queryByText(/^Network Status$/)).toBeNull();
  });

  it('swipe that starts elsewhere on the Bitcoin panel still changes tab', () => {
    const { outer } = openBitcoinBySwipe();
    fireEvent.touchStart(outer, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(outer, { changedTouches: [{ clientX: 150, clientY: 205 }] });
    expect(screen.queryByText(/^Network Status$/)).toBeNull();
  });
});
