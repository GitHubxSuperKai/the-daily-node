import React from 'react';
globalThis.React = React;

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewportMode } from '../../src/hooks/useViewportMode.js';

describe('useViewportMode', () => {
  let original;
  beforeEach(() => { original = window.innerWidth; });
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: original });
  });

  function setWidth(w) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    window.dispatchEvent(new Event('resize'));
  }

  it('returns desktop above breakpoint', () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('desktop');
  });

  it('returns mobile at breakpoint', () => {
    setWidth(600);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('mobile');
  });

  it('returns mobile below breakpoint', () => {
    setWidth(390);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('mobile');
  });

  it('updates from desktop to mobile on resize', async () => {
    setWidth(1920);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('desktop');
    await act(async () => { setWidth(390); });
    expect(result.current).toBe('mobile');
  });

  it('updates from mobile to desktop on resize', async () => {
    setWidth(390);
    const { result } = renderHook(() => useViewportMode());
    expect(result.current).toBe('mobile');
    await act(async () => { setWidth(1920); });
    expect(result.current).toBe('desktop');
  });
});
