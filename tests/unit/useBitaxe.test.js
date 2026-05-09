import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBitaxe } from '../../src/hooks/useBitaxe.js';

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
});
