import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Auto-cleanup DOM after each test (required when globals: false)
afterEach(() => cleanup());

// jsdom does not implement ResizeObserver — stub it out
global.ResizeObserver = class ResizeObserver {
  constructor(cb) { this._cb = cb; }
  observe() {}
  unobserve() {}
  disconnect() {}
};

// jsdom does not implement the CSS Font Loading API; Miners.jsx calls
// document.fonts.load() to measure its hero type before sizing it. Guard on the
// method, not the object — a future jsdom shipping a partial FontFaceSet would
// skip an object-only check and break at the call site. defineProperty because
// plain assignment throws if jsdom later exposes it as a read-only getter.
if (!document.fonts?.load) {
  Object.defineProperty(document, 'fonts', {
    value: { load: () => Promise.resolve([]), ready: Promise.resolve() },
    configurable: true,
  });
}
