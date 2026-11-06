import L from 'leaflet';
import { PMTiles } from 'pmtiles';

// Raster tiles from one PMTiles archive (satellite layers, the CAD plan), read with HTTP range
// requests: no tile server and no thousands of small files.

const MIME: Record<number, string> = {
  2: 'image/png',
  3: 'image/jpeg',
  4: 'image/webp',
  5: 'image/avif',
};
const archives = new Map<string, PMTiles>();

export function archive(url: string): PMTiles {
  let a = archives.get(url);
  if (!a) archives.set(url, (a = new PMTiles(url)));
  return a;
}

export function pmtilesLayer(url: string, options: L.GridLayerOptions = {}): L.GridLayer {
  const source = archive(url);
  const mime = source.getHeader().then((h) => MIME[h.tileType] ?? 'image/png');
  const Layer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const img = document.createElement('img');
      img.alt = '';
      const controller = new AbortController();
      (img as HTMLImageElement & { cancel?: () => void }).cancel = () => controller.abort();
      Promise.all([mime, source.getZxy(coords.z, coords.x, coords.y, controller.signal)])
        .then(([type, tile]) => {
          if (tile) {
            const src = URL.createObjectURL(new Blob([tile.data], { type }));
            img.onload = () => URL.revokeObjectURL(src);
            img.src = src;
          } else img.style.visibility = 'hidden';
          done(undefined, img);
        })
        .catch((e: Error) => {
          if (e.name !== 'AbortError') done(e, img);
        });
      return img;
    },
    _removeTile(this: L.GridLayer & { _tiles: Record<string, { el: HTMLElement }> }, key: string) {
      const t = this._tiles[key];
      (t?.el as HTMLImageElement & { cancel?: () => void })?.cancel?.();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (L.GridLayer.prototype as any)._removeTile.call(this, key);
    },
  });
  return new (Layer as unknown as new (o: L.GridLayerOptions) => L.GridLayer)(options);
}
