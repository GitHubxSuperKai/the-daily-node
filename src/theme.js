import React from 'react';

// ─── Font Stack ───────────────────────────────────────────
const FONTS = {
  serif:      '"Playfair Display", Georgia, serif',
  body:       '"Newsreader", Georgia, serif',
  sans:       '"Inter Tight", system-ui, sans-serif',
  mono:       '"Courier Prime", "Courier New", monospace',
  numDisplay: '"Playfair Display", Georgia, serif',
  num:        '"Newsreader", Georgia, serif',
};

// ─── Light Theme ──────────────────────────────────────────
export const LIGHT = {
  ...FONTS,
  ink: '#16130f',
  ink2: '#4a4438',
  ink3: '#8a8272',
  ink4: '#b8b0a0',
  paper: '#f3eee4',
  paper2: '#ebe4d6',
  paperHi: '#faf6ec',
  rule: 'rgba(26,23,20,1)',
  rule2: 'rgba(26,23,20,0.18)',
  rule3: 'rgba(26,23,20,0.08)',
  orange: '#c8641a',
  red: '#9c2a1a',
  green: '#3a6b2e',
};

// ─── Dark Theme ───────────────────────────────────────────
export const DARK = {
  ...FONTS,
  ink: '#e8e2d6',
  ink2: '#a8a090',
  ink3: '#706858',
  ink4: '#504840',
  paper: '#121110',
  paper2: '#1c1a17',
  paperHi: '#1f1d1a',
  rule: 'rgba(232,226,214,0.85)',
  rule2: 'rgba(232,226,214,0.12)',
  rule3: 'rgba(232,226,214,0.06)',
  orange: '#d4743a',
  red: '#c44040',
  green: '#5a9b4e',
};

// ─── Theme Context ────────────────────────────────────────
export const ThemeCtx = React.createContext(LIGHT);

/**
 * useT Hook
 * Access the current theme from context
 *
 * Usage: const T = useT();
 */
export function useT() {
  return React.useContext(ThemeCtx);
}
