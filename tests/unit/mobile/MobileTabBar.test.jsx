import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../../src/theme.js';
import { MobileTabBar } from '../../../src/components/mobile/MobileTabBar.jsx';

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('MobileTabBar', () => {
  it('renders three tab buttons', () => {
    wrap(<MobileTabBar activeTab="home" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /home/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /bitcoin/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /news/i })).toBeDefined();
  });

  it('invokes onChange with new tab id when an inactive tab is clicked', () => {
    const onChange = vi.fn();
    wrap(<MobileTabBar activeTab="home" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /bitcoin/i }));
    expect(onChange).toHaveBeenCalledWith('bitcoin');
  });

  it('marks the active tab with aria-current="page"', () => {
    wrap(<MobileTabBar activeTab="news" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /news/i }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: /home/i }).getAttribute('aria-current')).toBeNull();
  });
});
