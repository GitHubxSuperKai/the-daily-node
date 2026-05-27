import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBTC } from '../../src/hooks/useBTC.js';

const krakenResp = {
  ok: true,
  json: async () => ({
    error: [],
    result: {
      XXBTZUSD: {
        c: ['67891.5', '0.5'],
        o: '66000.0',
        v: ['1000', '20000'],
        h: ['68000', '69000'],
        l: ['65000', '64500'],
        p: ['66500', '66700'],
      },
    },
  }),
};

const cgChartResp = {
  ok: true,
  json: async () => ({
    prices: [
      [1700000000000, 65000],
      [1700003600000, 66000],
      [1700007200000, 67000],
    ],
    market_caps: [
      [1700000000000, 1.3e12],
      [1700007200000, 1.32e12],
    ],
  }),
};

const cgMetaResp = {
  ok: true,
  json: async () => ({
    market_data: {
      ath: { usd: 73000 },
      ath_date: { usd: '2024-03-14T00:00:00Z' },
      circulating_supply: 19_700_000,
    },
  }),
};

function routeByUrl(url) {
  const { hostname, pathname } = new URL(String(url));
  if (hostname === 'api.kraken.com') return krakenResp;
  if (hostname === 'api.coingecko.com' && pathname.endsWith('/market_chart')) return cgChartResp;
  if (hostname === 'api.coingecko.com' && pathname === '/api/v3/coins/bitcoin') return cgMetaResp;
  return { ok: true, json: async () => ({}) };
}

describe('useBTC', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetches Kraken + CoinGecko and exposes price + chart points', async () => {
    global.fetch = vi.fn().mockImplementation((url) => Promise.resolve(routeByUrl(url)));

    const { result } = renderHook(() => useBTC());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() => expect(result.current.chartPts).not.toBeNull());

    expect(result.current.data).toBeTruthy();
    expect(result.current.data.price).toBeCloseTo(67891.5);
    expect(result.current.data.chgAbs).toBeCloseTo(1891.5);
    expect(result.current.chartPts).toHaveLength(3);
    expect(result.current.error).toBe(false);
    expect(result.current.lastOk).toBeGreaterThan(0);
  });

  it('sets error=true when Kraken fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { result } = renderHook(() => useBTC());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.data).toBeNull();
  });
});
