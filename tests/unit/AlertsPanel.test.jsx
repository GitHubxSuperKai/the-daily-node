import React from 'react';
globalThis.React = React;

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, renderHook, act } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { AlertsPanel, watchingSentence, shortMessage } from '../../src/components/AlertsPanel.jsx';
import { Sidebar } from '../../src/components/Sidebar.jsx';
import { useAlerts, mergeAlert, HISTORY_KEY } from '../../src/hooks/useAlerts.js';

const NOW = Date.UTC(2026, 9, 20, 22, 0, 0);
const MIN = 60 * 1000;

const ON = {
  fee: { enabled: true, threshold: 50, cooldownMin: 30 },
  blockTime: { enabled: true, cooldownMin: 60 },
  minerOffline: { enabled: true, cooldownMin: 10 },
  price: { enabled: false, pctThreshold: 5, windowMin: 60, cooldownMin: 60 },
};
const OFF = Object.fromEntries(Object.entries(ON).map(([k, v]) => [k, { ...v, enabled: false }]));

const alert = (type, minsAgo, message) => ({ id: `${type}-${NOW - minsAgo * MIN}`, type, message, ts: NOW - minsAgo * MIN });

function renderPanel(props) {
  return render(
    <ThemeCtx.Provider value={LIGHT}>
      <AlertsPanel alerts={[]} alertPrefs={ON} now={NOW} timeFormat="24h" {...props} />
    </ThemeCtx.Provider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AlertsPanel', () => {
  it('says alerts are off, and lists nothing, when every alert is disabled', () => {
    renderPanel({ alertPrefs: OFF, alerts: [alert('fee', 5, 'Fee spike: 64 sat/vB (threshold: 50)')] });
    expect(screen.getByText('Off')).toBeTruthy();
    expect(screen.getByText('All alerts are off. Turn them on in Settings › Alerts.')).toBeTruthy();
    expect(screen.queryByText(/64 sat\/vB/)).toBeNull();
  });

  it('says what it is watching when alerts are on and none fired in 24h', () => {
    renderPanel({ alerts: [alert('fee', 25 * 60, 'Fee spike: old')] });
    expect(screen.getByText('None in 24h')).toBeTruthy();
    expect(screen.getByText('All quiet. Watching fees above 50 sat/vB, blocks over 15 min and miners going offline.')).toBeTruthy();
    expect(screen.queryByText(/old/)).toBeNull();
  });

  it('lists alerts newest first with the count and the new (last hour) count', () => {
    renderPanel({
      alerts: [
        alert('blockTime', 300, 'No block in 22 minutes'),
        alert('fee', 10, 'Fee spike: 64 sat/vB (threshold: 50)'),
        alert('minerOffline', 50, 'Miner offline: rig-2'),
      ],
    });
    expect(screen.getByText('3 in 24h · 2 new')).toBeTruthy();
    const labels = screen.getAllByText(/^(Fee spike|Miner offline|Block time)$/).map(el => el.textContent);
    expect(labels).toEqual(['Fee spike', 'Miner offline', 'Block time']);
    // The type prefix is dropped from the message: the label already says it.
    expect(screen.getByText('64 sat/vB (threshold: 50)')).toBeTruthy();
    expect(screen.getByText('rig-2')).toBeTruthy();
    // Times are local, in the 24h format asked for.
    const d = new Date(NOW - 10 * MIN);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    expect(screen.getByText(hhmm)).toBeTruthy();
  });

  it('omits the new count when nothing fired in the last hour', () => {
    renderPanel({ alerts: [alert('fee', 90, 'Fee spike: 64 sat/vB')] });
    expect(screen.getByText('1 in 24h')).toBeTruthy();
  });

  it('shows the dismiss × only while the row is hovered, and dismisses that alert', () => {
    const dismissed = [];
    const a = alert('fee', 10, 'Fee spike: 64 sat/vB');
    const b = alert('minerOffline', 20, 'Miner offline: rig-2');
    renderPanel({ alerts: [a, b], onDismiss: id => dismissed.push(id) });
    const x = screen.getByRole('button', { name: 'Dismiss Fee spike alert' });
    const other = screen.getByRole('button', { name: 'Dismiss Miner offline alert' });
    expect(x.style.opacity).toBe('0');
    fireEvent.mouseEnter(x.parentElement);
    expect(x.style.opacity).toBe('1');
    expect(other.style.opacity).toBe('0');
    fireEvent.mouseLeave(x.parentElement);
    expect(x.style.opacity).toBe('0');
    fireEvent.click(x);
    expect(dismissed).toEqual([a.id]);
  });

  it('shows only the rows that fit, keeping the first laid out but hidden when none do', () => {
    // Fake layout: the panel is `regionPx` tall, its header 30px, each row 24px.
    const size = { regionPx: 30 + 24 * 2 };
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this.hasAttribute('data-fit-row')) {
        const i = [...this.parentElement.querySelectorAll('[data-fit-row]')].indexOf(this);
        return { top: 30 + 24 * i, height: 24 };
      }
      if (this.hasAttribute('data-alerts')) return { top: 0, height: size.regionPx };
      return { top: 0, height: 0 };
    });
    const observers = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe() {}
      disconnect() {}
    });
    const alerts = [alert('fee', 5, 'Fee spike: a'), alert('price', 6, 'b'), alert('blockTime', 7, 'c')];
    renderPanel({ alerts });
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('3 in 24h · 3 new')).toBeTruthy();

    // The rail above grows until not even one row fits.
    size.regionPx = 30 + 10;
    act(() => observers.forEach(o => o.cb()));
    const rows = document.querySelectorAll('[data-fit-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].style.visibility).toBe('hidden');
  });

  it('does not dismiss on a press that began while the × was hidden (a touch tap)', () => {
    const dismissed = [];
    const a = alert('fee', 10, 'Fee spike: 64 sat/vB');
    renderPanel({ alerts: [a], onDismiss: id => dismissed.push(id) });
    const x = screen.getByRole('button', { name: 'Dismiss Fee spike alert' });
    // Touch order: pointerdown, then the emulated mouseenter, then click.
    fireEvent.pointerDown(x);
    fireEvent.mouseEnter(x.parentElement);
    fireEvent.click(x, { detail: 1 });
    expect(dismissed).toEqual([]);
    expect(x.style.opacity).toBe('1');
    // The second tap, with the × showing, dismisses.
    fireEvent.pointerDown(x);
    fireEvent.click(x, { detail: 1 });
    expect(dismissed).toEqual([a.id]);
  });

  it('shows the × on keyboard focus too', () => {
    renderPanel({ alerts: [alert('fee', 10, 'Fee spike: 64 sat/vB')] });
    const x = screen.getByRole('button', { name: 'Dismiss Fee spike alert' });
    fireEvent.focus(x);
    expect(x.style.opacity).toBe('1');
  });
});

describe('repeats', () => {
  const COOL = 10 * MIN;
  const at = (type, ts, message = `${type} at ${ts}`) => ({ id: `${type}-${ts}`, type, message, ts });

  it('folds a repeat within two cooldowns into the newest row of its type, moved to the top', () => {
    const first = at('minerOffline', NOW - 12 * MIN, 'Miner offline: rig-2');
    const fee = at('fee', NOW - 5 * MIN);
    const next = mergeAlert([fee, first], at('minerOffline', NOW, 'Miner offline: rig-2, rig-3'), COOL);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual({
      id: first.id, type: 'minerOffline', message: 'Miner offline: rig-2, rig-3',
      ts: NOW, since: first.ts, count: 2,
    });
    expect(next[1]).toBe(fee);
    // A third fire keeps the first `since` and counts on.
    const third = mergeAlert(next, at('minerOffline', NOW + 11 * MIN), COOL);
    expect(third[0]).toMatchObject({ id: first.id, since: first.ts, count: 3, ts: NOW + 11 * MIN });
  });

  it('starts a new row after a gap longer than two cooldowns, or for a different type', () => {
    const old = at('fee', NOW - 21 * MIN);
    expect(mergeAlert([old], at('fee', NOW), COOL).map(a => a.id)).toEqual([`fee-${NOW}`, old.id]);
    expect(mergeAlert([old], at('price', NOW), COOL)).toHaveLength(2);
    // Exactly two cooldowns still merges.
    expect(mergeAlert([at('fee', NOW - 20 * MIN)], at('fee', NOW), COOL)).toHaveLength(1);
  });

  it('starts a new row once the earlier one was dismissed', () => {
    // A dismissed row is gone from the history, so there is nothing to merge into.
    const next = mergeAlert([], at('fee', NOW), COOL);
    expect(next).toEqual([at('fee', NOW)]);
  });

  it('drops rows past 24 hours while merging', () => {
    const stale = at('price', NOW - 25 * 60 * MIN);
    expect(mergeAlert([stale], at('fee', NOW), COOL).map(a => a.type)).toEqual(['fee']);
  });

  it('shows the repeat count beside the label and when it started', () => {
    const d = new Date(NOW - 50 * MIN);
    const since = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    renderPanel({
      alerts: [{ id: 'm', type: 'minerOffline', message: 'Miner offline: rig-2', ts: NOW - 5 * MIN, since: NOW - 50 * MIN, count: 6 }],
    });
    expect(screen.getByText('Miner offline')).toBeTruthy();
    expect(screen.getByText('×6')).toBeTruthy();
    expect(screen.getByText(`since ${since} · rig-2`)).toBeTruthy();
    // One row, one alert.
    expect(screen.getByText('1 in 24h · 1 new')).toBeTruthy();
  });

  it('a condition that keeps firing stays one row in the hook', () => {
    let now = Date.now();
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const prefs = { alerts: ON };
    const t = { fastFee: 10, msSinceLastBlock: 60 * 1000, miners: [], btcPrice: null, priceHistory: [] };
    const { result, rerender } = renderHook(({ fee }) => useAlerts({ ...t, fastFee: fee }, prefs), { initialProps: { fee: 80 } });
    expect(result.current.history).toHaveLength(1);
    // Fee cooldown is 30 min; fire again 31 and 62 min later while the spike continues.
    now += 31 * MIN; rerender({ fee: 81 });
    now += 31 * MIN; rerender({ fee: 82 });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toMatchObject({ type: 'fee', count: 3 });
    expect(result.current.history[0].message).toMatch(/82 sat\/vB/);
    // Dismiss it: the next fire starts a fresh row.
    act(() => result.current.dismiss(result.current.history[0].id));
    now += 31 * MIN; rerender({ fee: 83 });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].count).toBeUndefined();
    spy.mockRestore();
  });
});

describe('watchingSentence / shortMessage', () => {
  it('names each enabled alert, joined with "and"', () => {
    expect(watchingSentence({ fee: { enabled: true, threshold: 20 } })).toBe('All quiet. Watching fees above 20 sat/vB.');
    expect(watchingSentence({ ...ON, price: { ...ON.price, enabled: true } }))
      .toBe('All quiet. Watching fees above 50 sat/vB, blocks over 15 min, miners going offline and price moves of 5% in 60 min.');
    expect(watchingSentence(OFF)).toBeNull();
  });

  it('drops only a known type prefix', () => {
    expect(shortMessage('Fee spike: 64 sat/vB')).toBe('64 sat/vB');
    expect(shortMessage('Miner offline: rig-2')).toBe('rig-2');
    expect(shortMessage('No block in 22 minutes')).toBe('No block in 22 minutes');
  });
});

describe('Sidebar', () => {
  it('shows Alerts in the rail and no Mining Pools list (it is in Network Status)', () => {
    const props = {
      clock: { timeHM: '12:00', timeSec: '00', amPm: null, dayStr: 'Monday' },
      weather: {}, prefs: { tempUnit: 'C', timeFormat: '24h' }, sys: [],
      alerts: [], alertPrefs: ON, now: NOW,
    };
    const { container } = render(<ThemeCtx.Provider value={LIGHT}><Sidebar {...props} /></ThemeCtx.Provider>);
    expect(container.querySelector('[data-alerts]')).toBeTruthy();
    expect(screen.getByText('Alerts')).toBeTruthy();
    expect(container.querySelector('[data-pool-list]')).toBeNull();
    expect(screen.queryByText(/^Mining Pools · /)).toBeNull();
  });
});

describe('useAlerts history', () => {
  const prefs = { alerts: ON };
  const quiet = { fastFee: 10, msSinceLastBlock: 60 * 1000, miners: [], btcPrice: null, priceHistory: [] };

  beforeEach(() => localStorage.clear());

  it('adds a fired alert to the history and saves it', () => {
    const { result, rerender } = renderHook(({ t }) => useAlerts(t, prefs), { initialProps: { t: quiet } });
    expect(result.current.history).toEqual([]);
    rerender({ t: { ...quiet, fastFee: 80 } });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].type).toBe('fee');
    expect(result.current.history[0].message).toMatch(/^Fee spike: 80 sat\/vB/);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY))).toHaveLength(1);
  });

  it('dismiss removes one alert from the history and from storage', () => {
    const { result, rerender } = renderHook(({ t }) => useAlerts(t, prefs), { initialProps: { t: quiet } });
    rerender({ t: { ...quiet, fastFee: 80, miners: [{ ip: 'rig-2', online: false }] } });
    expect(result.current.history).toHaveLength(2);
    const fee = result.current.history.find(a => a.type === 'fee');
    act(() => result.current.dismiss(fee.id));
    expect(result.current.history.map(a => a.type)).toEqual(['minerOffline']);
    expect(JSON.parse(localStorage.getItem(HISTORY_KEY)).map(a => a.type)).toEqual(['minerOffline']);
  });

  it('loads saved alerts from the last 24 hours, dropping older and malformed ones', () => {
    const now = Date.now();
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { id: 'fee-1', type: 'fee', message: 'Fee spike: 70', ts: now - 60 * MIN },
      { id: 'fee-2', type: 'fee', message: 'Fee spike: 90', ts: now - 25 * 60 * MIN },
      { id: 'bad', type: 'fee', ts: now },
      null,
    ]));
    const { result } = renderHook(() => useAlerts(quiet, prefs));
    expect(result.current.history.map(a => a.id)).toEqual(['fee-1']);
  });

  it('does not fire again on remount while a saved alert of that type is in cooldown', () => {
    const now = Date.now();
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { id: 'fee-1', type: 'fee', message: 'Fee spike: 80 sat/vB (threshold: 50)', ts: now - 5 * MIN },
    ]));
    // fastFee is still over the threshold, as after a reload mid-spike.
    const { result } = renderHook(() => useAlerts({ ...quiet, fastFee: 80 }, prefs));
    expect(result.current.history.map(a => a.id)).toEqual(['fee-1']);
    expect(result.current.toasts).toEqual([]);
  });

  it('fires on remount once the saved alert is past its cooldown, as a repeat of that row', () => {
    const now = Date.now();
    localStorage.setItem(HISTORY_KEY, JSON.stringify([
      { id: 'fee-1', type: 'fee', message: 'Fee spike: 80', ts: now - 31 * MIN },
    ]));
    const { result } = renderHook(() => useAlerts({ ...quiet, fastFee: 80 }, prefs));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toMatchObject({ id: 'fee-1', count: 2, since: now - 31 * MIN });
  });

  it('starts empty when storage holds garbage', () => {
    localStorage.setItem(HISTORY_KEY, '{not json');
    const { result } = renderHook(() => useAlerts(quiet, prefs));
    expect(result.current.history).toEqual([]);
  });
});
