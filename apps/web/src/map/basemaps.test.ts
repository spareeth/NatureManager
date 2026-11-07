import { describe, expect, it } from 'vitest';
import { offlineBasemap, offlineTemplates, resolveBasemaps, type Basemap } from './basemaps';

const b = (over: Partial<Basemap>): Basemap => ({
  id: over.name ?? 'x',
  site_id: 's1',
  name: 'x',
  kind: 'xyz',
  url: 'https://t/{z}/{x}/{y}.png',
  attribution: null,
  min_zoom: 0,
  max_zoom: 22,
  max_native_zoom: 19,
  offline_allowed: false,
  is_default: false,
  sort_order: 100,
  active: true,
  ...over,
});
const OSM = b({ name: 'OSM', sort_order: 10, offline_allowed: true });
const GOOGLE = b({ name: 'Google', kind: 'google', url: null, sort_order: 20, is_default: true });
const ESRI = b({ name: 'Esri', kind: 'esri', url: null, sort_order: 30 });
const DRONE = b({ name: 'Drone', sort_order: 5, offline_allowed: true });

describe('base maps', () => {
  it('shows Google and Esri only with their keys, in order', () => {
    expect(resolveBasemaps([ESRI, GOOGLE, OSM], {}).layers.map((x) => x.name)).toEqual(['OSM']);
    expect(
      resolveBasemaps([ESRI, GOOGLE, OSM], { google: 'k', esri: 'e' }).layers.map((x) => x.name),
    ).toEqual(['OSM', 'Google', 'Esri']);
  });
  it('opens on the site default when it can be shown, else the first layer', () => {
    expect(resolveBasemaps([OSM, GOOGLE], { google: 'k' }).defaultId).toBe('Google');
    expect(resolveBasemaps([OSM, GOOGLE], {}).defaultId).toBe('OSM');
  });
  it('falls back to OpenStreetMap when nothing is usable', () => {
    expect(resolveBasemaps([b({ name: 'Off', active: false })], {}).layers[0]!.name).toBe(
      'OpenStreetMap',
    );
  });
  it('the field map uses only layers that may be stored offline', () => {
    expect(offlineBasemap([OSM, GOOGLE], { google: 'k' }).name).toBe('OSM');
    expect(offlineBasemap([OSM, DRONE, GOOGLE], { google: 'k' }).name).toBe('Drone');
    expect(
      offlineTemplates([
        OSM,
        DRONE,
        GOOGLE,
        ESRI,
        b({ name: 'Old', offline_allowed: true, active: false }),
      ]),
    ).toEqual([OSM.url, DRONE.url]);
  });
});
