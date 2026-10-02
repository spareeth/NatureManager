/** WGS 84 lat/lon to 6 decimals (about 0.1 m), the precision shown on screen. */
export function formatLatLon(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(6)}° ${ns}, ${Math.abs(lng).toFixed(6)}° ${ew}`;
}

/** Site grid x, y in metres, 2 decimals, as stored on asset.local_x / local_y. */
export function formatGrid(x: number, y: number): string {
  return `x ${x.toFixed(2)} m, y ${y.toFixed(2)} m`;
}
