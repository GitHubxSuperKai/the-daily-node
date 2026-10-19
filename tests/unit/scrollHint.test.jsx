import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { ScrollHint } from '../../src/components/ScrollHint.jsx';

const withTheme = (ui) => render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);

// jsdom has no layout: scrollHeight/clientHeight are always 0. Give the
// .scroll-hint element a fake geometry so ScrollHint's measurement has
// something to read. scrollTop is a real, writable property in jsdom.
const fakeGeometry = ({ scrollHeight, clientHeight }) => {
  const pick = (real) => function () {
    return this.classList?.contains('scroll-hint') ? (real === 'scroll' ? scrollHeight : clientHeight) : 0;
  };
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(pick('scroll'));
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(pick('client'));
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ScrollHint', () => {
  it('marks the bottom edge and shows the More cue when content overflows', () => {
    fakeGeometry({ scrollHeight: 500, clientHeight: 200 });
    withTheme(<ScrollHint><p>body</p></ScrollHint>);
    const el = document.querySelector('.scroll-hint');
    expect(el.hasAttribute('data-more-below')).toBe(true);
    expect(el.hasAttribute('data-more-above')).toBe(false);
    expect(screen.getByRole('button', { name: /more/i })).toBeTruthy();
  });

  it('marks neither edge and shows no cue when content fits', () => {
    fakeGeometry({ scrollHeight: 200, clientHeight: 200 });
    withTheme(<ScrollHint><p>body</p></ScrollHint>);
    const el = document.querySelector('.scroll-hint');
    expect(el.hasAttribute('data-more-below')).toBe(false);
    expect(el.hasAttribute('data-more-above')).toBe(false);
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
  });

  it('flips to the top edge once scrolled to the bottom', () => {
    fakeGeometry({ scrollHeight: 500, clientHeight: 200 });
    withTheme(<ScrollHint><p>body</p></ScrollHint>);
    const el = document.querySelector('.scroll-hint');
    el.scrollTop = 300;
    fireEvent.scroll(el);
    expect(el.hasAttribute('data-more-above')).toBe(true);
    expect(el.hasAttribute('data-more-below')).toBe(false);
    expect(screen.queryByRole('button', { name: /more/i })).toBeNull();
  });

  // Feeds load after mount, so the mount-time measure sees the empty state; the
  // ResizeObserver callback is what notices content arriving. tests/setup.js
  // stubs ResizeObserver with a no-op, so capture the callback here and fire it.
  it('re-measures when its ResizeObserver fires (content arriving after mount)', () => {
    const observers = [];
    const RealRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); } observe(t) { this.targets.push(t); } disconnect() {} };
    try {
      let geometry = { scrollHeight: 200, clientHeight: 200 };
      vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function () { return this.classList?.contains('scroll-hint') ? geometry.scrollHeight : 0; });
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function () { return this.classList?.contains('scroll-hint') ? geometry.clientHeight : 0; });
      withTheme(<ScrollHint><p>body</p></ScrollHint>);
      const el = document.querySelector('.scroll-hint');
      expect(el.hasAttribute('data-more-below')).toBe(false);
      expect(observers).toHaveLength(1);
      // In a fixed-height column the scroller's own box never resizes when content
      // grows; only the inner content div does, so it must be among the targets.
      expect(observers[0].targets).toContain(el.firstElementChild);
      geometry = { scrollHeight: 600, clientHeight: 200 };
      act(() => observers[0].cb([]));
      expect(el.hasAttribute('data-more-below')).toBe(true);
      expect(screen.getByRole('button', { name: /more/i })).toBeTruthy();
    } finally {
      globalThis.ResizeObserver = RealRO;
    }
  });

  it('scrolls down by most of a page when the cue is clicked', () => {
    fakeGeometry({ scrollHeight: 500, clientHeight: 200 });
    const scrollBy = vi.fn();
    HTMLElement.prototype.scrollBy = scrollBy;
    try {
      withTheme(<ScrollHint><p>body</p></ScrollHint>);
      fireEvent.click(screen.getByRole('button', { name: /more/i }));
      expect(scrollBy).toHaveBeenCalledWith({ top: 160, behavior: 'smooth' });
    } finally {
      delete HTMLElement.prototype.scrollBy;
    }
  });
});
