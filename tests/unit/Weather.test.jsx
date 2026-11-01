import React from 'react';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import Weather from '../../src/components/Weather.jsx';
import { makeProps } from '../fixtures/dashboardProps.js';

// The fixture's sun times are 06:12 / 19:44 with hour fields 6 / 19, and its UV
// values differ (today 6, tomorrow 7), so the cell label and value both show which
// side of sunrise/sunset the component thinks it is on.
const { weather } = makeProps();
const prefs = { timeFormat: '24h', tempUnit: 'fahrenheit' };

function renderAt(h, m, wx = weather) {
  // Fake only Date: the component reads the clock with `new Date()`.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 15, h, m));
  return render(
    <ThemeCtx.Provider value={LIGHT}><Weather weather={wx} prefs={prefs} /></ThemeCtx.Provider>,
  );
}

afterEach(() => { vi.useRealTimers(); });

describe('Weather UV cell', () => {
  it('still shows today\'s UV between the sunset hour and the sunset minute', () => {
    // 19:30 is after the truncated sunset hour (19) but before the 19:44 sunset.
    renderAt(19, 30);
    expect(screen.getByText('UV Index')).toBeDefined();
    expect(screen.queryByText('UV Tomorrow')).toBeNull();
  });

  it('switches to tomorrow\'s UV at the sunset minute', () => {
    renderAt(19, 44);
    expect(screen.getByText('UV Tomorrow')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
  });

  it('still shows tomorrow\'s UV between the sunrise hour and the sunrise minute', () => {
    // 06:05 is past the truncated sunrise hour (6) but before the 06:12 sunrise.
    renderAt(6, 5);
    expect(screen.getByText('UV Tomorrow')).toBeDefined();
    expect(screen.queryByText('UV Index')).toBeNull();
  });

  it('shows today\'s UV from the sunrise minute', () => {
    renderAt(6, 12);
    expect(screen.getByText('UV Index')).toBeDefined();
    expect(screen.getByText('6')).toBeDefined();
  });

  describe('with no sunrise/sunset fields, falls back to 06:00-20:00 daytime', () => {
    const data = { ...weather.data, wxSunrise: undefined, wxSunset: undefined, wxSunriseHr: undefined, wxSunsetHr: undefined };
    const noSun = { ...weather, data };

    it.each([[6, 0], [19, 59]])('%i:%i is daytime', (h, m) => {
      renderAt(h, m, noSun);
      expect(screen.getByText('UV Index')).toBeDefined();
    });

    it.each([[5, 59], [20, 0]])('%i:%i is night', (h, m) => {
      renderAt(h, m, noSun);
      expect(screen.getByText('UV Tomorrow')).toBeDefined();
    });
  });
});
