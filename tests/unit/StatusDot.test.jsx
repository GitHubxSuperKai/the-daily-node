import { describe, it, expect } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import StatusDot from '../../src/components/StatusDot.jsx';
import { ThemeCtx, LIGHT } from '../../src/theme.js';

const colorOf = (state) => {
  const { container } = render(
    <ThemeCtx.Provider value={LIGHT}><StatusDot state={state} /></ThemeCtx.Provider>,
  );
  return container.querySelector('span').style.color;
};

describe('StatusDot', () => {
  it('renders a pending source neutral, not as an error', () => {
    expect(colorOf('pending')).not.toBe(colorOf('down'));
    expect(colorOf('pending')).not.toBe(colorOf('stale'));
    expect(colorOf('pending')).not.toBe(colorOf('fresh'));
  });
});
