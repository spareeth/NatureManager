import { describe, expect, it, vi } from 'vitest';
import { createSatelliteSession, viewportAttribution } from './googleTiles';

const json = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 403, json: async () => body }) as Response;

describe('Google Map Tiles API client', () => {
  it('creates a satellite session and builds the official 2D tile URL', async () => {
    const fetchFn = vi.fn(async () => json({ session: 'abc', expiry: '1790000000' }));
    const s = await createSatelliteSession('KEY', 'en-US', fetchFn as unknown as typeof fetch);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://tile.googleapis.com/v1/createSession?key=KEY');
    expect(JSON.parse(init.body as string)).toEqual({
      mapType: 'satellite',
      language: 'en-US',
      region: 'AE',
    });
    expect(s.tileUrl).toBe(
      'https://tile.googleapis.com/v1/2dtiles/{z}/{x}/{y}?session=abc&key=KEY',
    );
    expect(s.expiry).toBe(1790000000000);
  });

  it('fails clearly when the key is rejected', async () => {
    const fetchFn = vi.fn(async () => json({}, false));
    await expect(
      createSatelliteSession('BAD', 'en-US', fetchFn as unknown as typeof fetch),
    ).rejects.toThrow('403');
  });

  it('asks for the viewport attribution and shows it', async () => {
    const fetchFn = vi.fn(async () => json({ copyright: '©2026 Airbus, Maxar Technologies' }));
    const text = await viewportAttribution(
      'KEY',
      'abc',
      18.4,
      { north: 25, south: 24.9, east: 55.2, west: 55.1 },
      fetchFn as unknown as typeof fetch,
    );
    expect(text).toBe('Imagery ©2026 Airbus, Maxar Technologies');
    const live = vi.fn(async () =>
      json({ copyright: 'Imagery ©2026 Airbus, CNES / Airbus, Maxar Technologies' }),
    );
    expect(
      await viewportAttribution(
        'k',
        's',
        18,
        { north: 1, south: 0, east: 1, west: 0 },
        live as unknown as typeof fetch,
      ),
    ).toBe('Imagery ©2026 Airbus, CNES / Airbus, Maxar Technologies');
    const url = new URL((fetchFn.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe('/tile/v1/viewport');
    expect(url.searchParams.get('zoom')).toBe('18');
    expect(url.searchParams.get('session')).toBe('abc');
  });
});
