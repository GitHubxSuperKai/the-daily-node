import React from 'react';

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import RangeButtons from '../../src/components/RangeButtons.jsx';

function mount(props) {
  return render(
    <ThemeCtx.Provider value={LIGHT}>
      <RangeButtons {...props} />
    </ThemeCtx.Provider>
  );
}

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('RangeButtons', () => {
  it('renders five buttons labelled 1H 24H 7D 30D 1Y in order', () => {
    const { container } = mount({ value: '24h', onChange: () => {} });
    const group = container.querySelector('[role="group"]');
    expect(group.getAttribute('aria-label')).toBe('Chart range');
    const btns = [...container.querySelectorAll('button')];
    expect(btns.map((b) => b.textContent)).toEqual(['1H', '24H', '7D', '30D', '1Y']);
    expect(btns.map((b) => b.getAttribute('data-range'))).toEqual(['1h', '24h', '7d', '30d', '1y']);
    expect(btns.every((b) => b.getAttribute('type') === 'button')).toBe(true);
  });

  it('marks only the value button aria-pressed and colours it orange', () => {
    const { container } = mount({ value: '7d', onChange: () => {} });
    const pressed = [...container.querySelectorAll('button')].filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((b) => b.getAttribute('data-range'))).toEqual(['7d']);
    const norm = (c) => { const d = document.createElement('div'); d.style.color = c; return d.style.color; };
    expect(pressed[0].style.color).toBe(norm(LIGHT.orange));
    const other = container.querySelector('[data-range="1h"]');
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.style.color).toBe(norm(LIGHT.ink3));
  });

  it('clicking another range calls onChange with its key', () => {
    const onChange = vi.fn();
    const { container } = mount({ value: '24h', onChange });
    fireEvent.click(container.querySelector('[data-range="7d"]'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('clicking the active button calls nothing', () => {
    const onChange = vi.fn();
    const { container } = mount({ value: '24h', onChange });
    fireEvent.click(container.querySelector('[data-range="24h"]'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders the note when given, and nothing when absent', () => {
    const { getByTestId, queryByTestId, rerender } = mount({ value: '24h', onChange: () => {}, note: 'no data' });
    expect(getByTestId('range-note').textContent).toBe('no data');
    rerender(
      <ThemeCtx.Provider value={LIGHT}>
        <RangeButtons value="24h" onChange={() => {}} />
      </ThemeCtx.Provider>
    );
    expect(queryByTestId('range-note')).toBeNull();
  });

  it('passes size props through as given (number and calc string)', () => {
    const { container } = mount({ value: '24h', onChange: () => {}, fontSize: 11, gap: 'calc(var(--u) * 8)' });
    const btn = container.querySelector('button');
    expect(btn.style.fontSize).toBe('11px');
    expect(container.querySelector('[role="group"]').style.gap).toBe('calc(var(--u) * 8)');
  });

  it('does not import the desktop-only scale helper (positive control: MarketsColumn does)', () => {
    expect(src('../../src/components/RangeButtons.jsx')).not.toMatch(/utils\/scale/);
    expect(src('../../src/components/MarketsColumn.jsx')).toMatch(/utils\/scale/);
  });
});
