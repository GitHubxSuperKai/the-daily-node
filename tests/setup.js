import React from 'react';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { LIGHT, ThemeCtx } from '../src/theme.js';

// Auto-cleanup DOM after each test (required when globals: false)
afterEach(() => cleanup());

// Global test setup — mirrors build-time globals available in the concatenated bundle
global.u = (n) => `${n}px`;
global._svgUid = 0;

// useT is a build-time global (defined in theme.js, stripped of imports/exports during concat).
// In tests, provide it as a global that returns the LIGHT theme.
global.useT = () => React.useContext(ThemeCtx);
