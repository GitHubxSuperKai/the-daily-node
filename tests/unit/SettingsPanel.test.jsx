import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { SettingsPanel } from '../../src/components/SettingsPanel.jsx';

const baseV2 = {
  alerts: {
    fee:          { enabled: true,  threshold: 50,  cooldownMin: 30 },
    blockTime:    { enabled: true,  cooldownMin: 60 },
    minerOffline: { enabled: true,  cooldownMin: 10 },
    price:        { enabled: false, pctThreshold: 5, windowMin: 60, cooldownMin: 60 },
  },
  feeds:     { bitcoinMagazine: true, coindesk: true, newsBitcoin: true },
  intervals: { price: 30, chain: 60, weather: 900, rss: 300, bitaxe: 30 },
  theme:     'auto',
};

const basePrefs = { lat: 0, lng: 0, cityName: '', timeFormat: '12h', tempUnit: 'fahrenheit' };

const minerList = [
  { ip: '192.168.1.10', online: true,  data: { hashRate: 500 } },
  { ip: '192.168.1.11', online: false },
];

function withTheme(node) {
  return <ThemeCtx.Provider value={LIGHT}>{node}</ThemeCtx.Provider>;
}

function renderPanel(overrides = {}) {
  const props = {
    prefs: basePrefs,
    v2prefs: baseV2,
    miners: minerList,
    onRefresh: vi.fn(),
    onSave: vi.fn(),
    onSaveV2: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(withTheme(<SettingsPanel {...props} />)), props };
}

describe('SettingsPanel — Miners (row-based)', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders one row per miner with online/offline state', () => {
    renderPanel();
    expect(screen.getByText('192.168.1.10')).toBeTruthy();
    expect(screen.getByText('192.168.1.11')).toBeTruthy();
    expect(screen.getByLabelText('192.168.1.10 online')).toBeTruthy();
    expect(screen.getByLabelText('192.168.1.11 offline')).toBeTruthy();
  });

  it('adds a miner — POSTs new full list and calls onRefresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ bitaxe_ips: ['192.168.1.10', '192.168.1.11', '192.168.1.20'] }),
    });
    const { props } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Add miner IP/i), { target: { value: '192.168.1.20' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      bitaxe_ips: ['192.168.1.10', '192.168.1.11', '192.168.1.20'],
    });
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
    expect(screen.getByLabelText(/Add miner IP/i).value).toBe('');
  });

  it('rejects an invalid IP locally (does not POST)', () => {
    global.fetch = vi.fn();
    renderPanel();
    fireEvent.change(screen.getByLabelText(/Add miner IP/i), { target: { value: '8.8.8.8' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/private\/LAN address/i)).toBeTruthy();
  });

  it('blocks duplicates in the UI', () => {
    global.fetch = vi.fn();
    renderPanel();
    fireEvent.change(screen.getByLabelText(/Add miner IP/i), { target: { value: '192.168.1.10' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add$/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/already in the list/i)).toBeTruthy();
  });

  it('removes a miner — POSTs reduced list and calls onRefresh', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ bitaxe_ips: ['192.168.1.11'] }),
    });
    const { props } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Remove 192\.168\.1\.10/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      bitaxe_ips: ['192.168.1.11'],
    });
    await waitFor(() => expect(props.onRefresh).toHaveBeenCalled());
  });

  it('confirms before removing the last miner', () => {
    global.fetch = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPanel({ miners: [{ ip: '192.168.1.10', online: true, data: {} }] });
    fireEvent.click(screen.getByRole('button', { name: /Remove 192\.168\.1\.10/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('surfaces server validation errors verbatim', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'validation failed', errors: ['not a private/LAN address: 8.8.8.8'] }),
    });
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Remove 192\.168\.1\.10/i }));
    await waitFor(() => expect(screen.getByText(/not a private\/LAN address/i)).toBeTruthy());
  });
});

describe('SettingsPanel — Preferences', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders Location, Time Format, and Temperature controls', () => {
    renderPanel({ prefs: { ...basePrefs, cityName: 'Berlin' } });
    expect(screen.getByDisplayValue('Berlin')).toBeTruthy();
    expect(screen.getByRole('button', { name: /12h AM\/PM/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /°F/i })).toBeTruthy();
  });

  it('calls onSave with current pending prefs on Save click', () => {
    const { props } = renderPanel({ prefs: { ...basePrefs, cityName: 'Berlin' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(props.onSave).toHaveBeenCalledWith(expect.objectContaining({
      cityName: 'Berlin', timeFormat: '12h', tempUnit: 'fahrenheit',
    }));
  });
});

describe('SettingsPanel — Alerts', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('renders all four alert sections and persists toggles via onSaveV2', () => {
    const { props } = renderPanel();
    expect(screen.getByText(/Fee spike/i)).toBeTruthy();
    expect(screen.getByText(/Block time drift/i)).toBeTruthy();
    expect(screen.getByText(/Miner offline/i)).toBeTruthy();
    expect(screen.getByText(/Price move/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(props.onSaveV2).toHaveBeenCalledWith(baseV2);
  });
});
