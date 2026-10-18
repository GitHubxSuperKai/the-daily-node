import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBitaxe } from '../../src/hooks/useBitaxe.js';
import CONFIG from '../../src/config.js';

describe('useBitaxe', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('always fetches /api/miners and surfaces the miners list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        miners: [
          { ip: '192.168.1.10', online: true,  data: { hashRate: 500 } },
          { ip: '192.168.1.11', online: false },
        ],
        count: 2,
      }),
    });
    const { result } = renderHook(() => useBitaxe());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(global.fetch).toHaveBeenCalledWith('/api/miners', expect.any(Object));
    expect(result.current.miners).toHaveLength(2);
    expect(result.current.miners[0].ip).toBe('192.168.1.10');
    expect(result.current.err).toBe(false);
  });

  it('marks err=true when /api/miners fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { result } = renderHook(() => useBitaxe());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.miners).toEqual([]);
    expect(result.current.err).toBe(true);
  });

  describe('latestFirmware', () => {
    const route = (firmware) => vi.fn((url) => {
      if (url === '/api/firmware') return firmware();
      return Promise.resolve({ ok: true, json: async () => ({ miners: [], count: 0 }) });
    });

    it('surfaces the latest release tag from /api/firmware', async () => {
      global.fetch = route(() => Promise.resolve({ ok: true, json: async () => ({ latest: 'v2.15.3' }) }));
      const { result } = renderHook(() => useBitaxe());
      await waitFor(() => expect(result.current.latestFirmware).toBe('v2.15.3'));
      expect(global.fetch).toHaveBeenCalledWith('/api/firmware', expect.any(Object));
    });

    it('is null before the first response and when the server knows no release', async () => {
      global.fetch = route(() => Promise.resolve({ ok: true, json: async () => ({ latest: null }) }));
      const { result } = renderHook(() => useBitaxe());
      expect(result.current.latestFirmware).toBeNull();
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/firmware', expect.any(Object)));
      expect(result.current.latestFirmware).toBeNull();
    });

    it('ignores a non-string latest', async () => {
      global.fetch = route(() => Promise.resolve({ ok: true, json: async () => ({ latest: 2 }) }));
      const { result } = renderHook(() => useBitaxe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/firmware', expect.any(Object)));
      expect(result.current.latestFirmware).toBeNull();
    });

    it('leaves err and lastOk alone when /api/firmware fails', async () => {
      // Reject only AFTER /api/miners has settled, so the miners success path
      // cannot overwrite whatever the firmware failure did to err/lastOk.
      let settled;
      const firmwareSettled = new Promise((r) => { settled = r; });
      global.fetch = route(() => new Promise((_, reject) => setTimeout(() => {
        reject(new TypeError('fetch failed'));
        setTimeout(settled, 0);
      }, 50)));
      const { result } = renderHook(() => useBitaxe());
      await waitFor(() => expect(result.current.loading).toBe(false));
      const lastOk = result.current.lastOk;
      expect(lastOk).not.toBeNull();
      await firmwareSettled;
      await waitFor(() => expect(result.current.err).toBe(false));
      expect(result.current.lastOk).toBe(lastOk);
      expect(result.current.latestFirmware).toBeNull();
    });

    it('polls /api/firmware on its own slow interval, not the miners interval', async () => {
      vi.useFakeTimers();
      try {
        global.fetch = route(() => Promise.resolve({ ok: true, json: async () => ({ latest: 'v2.15.3' }) }));
        renderHook(() => useBitaxe());
        const firmwareCalls = () => global.fetch.mock.calls.filter(([u]) => u === '/api/firmware').length;
        expect(firmwareCalls()).toBe(1);
        await vi.advanceTimersByTimeAsync(CONFIG.REFRESH_INTERVALS.bitaxe * 4);
        expect(firmwareCalls()).toBe(1);
        await vi.advanceTimersByTimeAsync(CONFIG.REFRESH_INTERVALS.firmware);
        expect(firmwareCalls()).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
