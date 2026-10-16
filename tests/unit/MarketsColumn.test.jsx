import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';

let capturedOnHover = null;
vi.mock('../../src/components/LineChart', () => ({
  default: (props) => {
    capturedOnHover = props.onHover;
    return <div data-testid="line-chart" />;
  },
}));

import { MarketsColumn } from '../../src/components/MarketsColumn.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

const liveData = { price: 81607, chgPct: -0.64, hi: 82500, lo: 80100, cap: 1.6e12, volBtc: 20000, vwap: 81000 };
const chain = { data: null };
const rss = { leadStory: null, err: null };

function mount(data = liveData) {
  return wrap(<MarketsColumn btc={{ data, chartPts: [] }} chain={chain} rss={rss} priceHistoryData={[]} />);
}

function hover(p) {
  act(() => { capturedOnHover(p); });
}

function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

// Headline is the hero number span; the % slot is the sibling div starting with the arrow.
const headline = (text) => screen.getByText(text, { selector: 'span' });
const slotOf = (lead) =>
  screen.getByText((_, el) => el.tagName === 'DIV' && el.textContent.startsWith(lead) && el.style.fontSize !== '' && el.children.length <= 1);

describe('MarketsColumn — chart readout', () => {
  beforeEach(() => { capturedOnHover = null; });

  it('live by default', () => {
    mount();
    expect(headline('$81,607')).toBeDefined();
    expect(slotOf('▼').textContent).toBe('▼ -0.64%');
  });

  it('hover swaps headline and slot', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    const slot = slotOf('▲');
    expect(slot.textContent).toContain('+0.86%');
    expect(slot.textContent).toContain('since');
  });

  it('downward move is red with ▼', () => {
    mount();
    hover({ t: 1, price: 82000 });
    const slot = slotOf('▼');
    expect(slot.textContent).toContain('-0.48%');
    expect(slot.style.color).toBe(hexToRgb(LIGHT.red));
  });

  it('onHover(null) restores live', () => {
    mount();
    hover({ t: 1, price: 80912 });
    hover(null);
    expect(headline('$81,607')).toBeDefined();
    expect(slotOf('▼').textContent).toBe('▼ -0.64%');
  });

  it('no live price shows — in the slot', () => {
    mount({ ...liveData, price: undefined });
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    expect(slotOf('—').textContent).toContain('—');
  });

  it('no data and no hover shows a bare —', () => {
    mount(null);
    expect(headline('—')).toBeDefined();
    expect(screen.queryByText('$—')).toBeNull();
  });

  it('ProofOfRead keeps the live price while hovering', () => {
    mount();
    hover({ t: 1, price: 80912 });
    expect(headline('$80,912')).toBeDefined();
    expect(screen.getByText(/at \$81,607/)).toBeDefined();
  });
});
