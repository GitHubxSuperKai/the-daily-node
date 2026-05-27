import React from 'react';
globalThis.React = React;

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { ErrorBoundary } from '../../src/components/ErrorBoundary.jsx';

function Boom() {
  throw new Error('kaboom');
}

function wrap(ui) {
  return render(<ThemeCtx.Provider value={LIGHT}>{ui}</ThemeCtx.Provider>);
}

describe('ErrorBoundary', () => {
  // React logs caught errors to console.error; silence it so test output stays clean.
  let errSpy;
  beforeEach(() => { errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
  afterEach(() => { errSpy.mockRestore(); });

  it('renders children unchanged when no error occurs', () => {
    wrap(<ErrorBoundary label="Network"><div>healthy content</div></ErrorBoundary>);
    expect(screen.getByText('healthy content')).toBeDefined();
  });

  it('renders a labeled fallback when a child throws', () => {
    wrap(<ErrorBoundary label="Network"><Boom /></ErrorBoundary>);
    expect(screen.getByText('Network unavailable')).toBeDefined();
  });

  it('renders a generic fallback when no label is provided', () => {
    wrap(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByText('Section unavailable')).toBeDefined();
  });

  it('isolates the failure — sibling content outside the boundary still renders', () => {
    wrap(
      <>
        <div>sibling survives</div>
        <ErrorBoundary label="Network"><Boom /></ErrorBoundary>
      </>,
    );
    expect(screen.getByText('sibling survives')).toBeDefined();
    expect(screen.getByText('Network unavailable')).toBeDefined();
  });

  it('logs the failure via componentDidCatch with the boundary label', () => {
    wrap(<ErrorBoundary label="Markets"><Boom /></ErrorBoundary>);
    const tagged = errSpy.mock.calls.some(args => args.some(a => String(a).includes('[ErrorBoundary · Markets]')));
    expect(tagged).toBe(true);
  });
});
