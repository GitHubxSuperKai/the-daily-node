import React from 'react';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { ThemeCtx } from '../src/theme.js';

// Auto-cleanup DOM after each test (required when globals: false)
afterEach(() => cleanup());

// Global test setup — mirrors build-time globals available in the concatenated bundle
global.u = (n) => `${n}px`;
global._svgUid = 0;

// jsdom does not implement ResizeObserver — stub it out
global.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};

// useT is a build-time global (defined in theme.js, stripped of imports/exports during concat).
// In tests, provide it as a global that returns the LIGHT theme.
// eslint-disable-next-line react-hooks/rules-of-hooks -- test shim: assigning to global, not declaring a component
global.useT = () => React.useContext(ThemeCtx);
