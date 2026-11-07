// Google satellite imagery through the official Map Tiles API (2D tiles).
// https://developers.google.com/maps/documentation/tile/2d-tiles-overview
// Terms: show the attribution returned for the viewport; tiles must not be stored for
// offline use (see docs/LICENCE_REGISTER.md).

const API = 'https://tile.googleapis.com';

export type GoogleSession = { session: string; expiry: number; tileUrl: string };

export async function createSatelliteSession(
  apiKey: string,
  language = 'en-US',
  fetchFn: typeof fetch = fetch,
): Promise<GoogleSession> {
  const res = await fetchFn(`${API}/v1/createSession?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mapType: 'satellite', language, region: 'AE' }),
  });
  if (!res.ok) throw new Error(`Google Map Tiles session failed: ${res.status}`);
  const body = (await res.json()) as { session: string; expiry: string };
  return {
    session: body.session,
    expiry: Number(body.expiry) * 1000,
    tileUrl: `${API}/v1/2dtiles/{z}/{x}/{y}?session=${encodeURIComponent(body.session)}&key=${encodeURIComponent(apiKey)}`,
  };
}

export async function viewportAttribution(
  apiKey: string,
  session: string,
  zoom: number,
  bounds: { north: number; south: number; east: number; west: number },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const q = new URLSearchParams({
    session,
    key: apiKey,
    zoom: String(Math.round(zoom)),
    north: String(bounds.north),
    south: String(bounds.south),
    east: String(bounds.east),
    west: String(bounds.west),
  });
  const res = await fetchFn(`${API}/tile/v1/viewport?${q}`);
  if (!res.ok) return 'Google';
  const body = (await res.json()) as { copyright?: string };
  if (!body.copyright) return 'Google';
  // The live API already starts the text with "Imagery"; add it only when missing.
  return /^imagery\b/i.test(body.copyright) ? body.copyright : `Imagery ${body.copyright}`;
}
