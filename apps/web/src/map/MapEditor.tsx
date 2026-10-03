import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AssetForm, type NewGeometry } from '../assets/AssetForm';
import { fetchAssetDetail } from '../assets/api';
import { moveAsset } from '../assets/editApi';
import { POSITION_SOURCES } from '../assets/statuses';
import { distinctCorners, pointEWKT, polygonEWKT, type LngLat } from './geometry';
import { formatLatLon } from './format';

type Mode = 'idle' | 'point' | 'polygon' | 'form' | 'move';
type Props = { map: L.Map | null; orgId: string; siteId: string | undefined; canEdit: boolean };

const ll = (c: LngLat): L.LatLngTuple => [c[1], c[0]];

/** Add assets by clicking (point) or drawing (planting group polygon), and move an asset (?move=id). */
export function MapEditor({ map, orgId, siteId, canEdit }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const moveId = params.get('move');
  const [mode, setMode] = useState<Mode>(moveId ? 'move' : 'idle');
  const [corners, setCorners] = useState<LngLat[]>([]);
  const [geometry, setGeometry] = useState<NewGeometry | null>(null);
  const [movePoint, setMovePoint] = useState<LngLat | null>(null);
  const [moveSource, setMoveSource] = useState('');
  const [moveAccuracy, setMoveAccuracy] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const sketch = useRef<L.LayerGroup | null>(null);

  const moving = useQuery({
    queryKey: ['asset', moveId],
    enabled: !!moveId,
    queryFn: () => fetchAssetDetail(moveId!),
  });

  // Sketch layer for markers and the polygon outline being drawn.
  useEffect(() => {
    if (!map) return;
    const g = L.layerGroup().addTo(map);
    sketch.current = g;
    return () => {
      g.remove();
      sketch.current = null;
    };
  }, [map]);

  const reset = useCallback(() => {
    setMode('idle');
    setCorners([]);
    setGeometry(null);
    setMovePoint(null);
    setMoveError(null);
    if (moveId) setParams({}, { replace: true });
  }, [moveId, setParams]);

  // Draw the sketch.
  useEffect(() => {
    const g = sketch.current;
    if (!g) return;
    g.clearLayers();
    const dot = (c: LngLat, colour = '#166534') =>
      L.circleMarker(ll(c), {
        radius: 5,
        color: '#fff',
        weight: 2,
        fillColor: colour,
        fillOpacity: 1,
        interactive: false,
      }).addTo(g);
    if (mode === 'polygon' && corners.length) {
      L.polyline(corners.map(ll), { color: '#166534', dashArray: '4 4', interactive: false }).addTo(
        g,
      );
      corners.forEach((c) => dot(c));
    }
    if (geometry && mode === 'form') {
      if (geometry.polygon)
        L.polygon(corners.map(ll), {
          color: '#166534',
          weight: 2,
          fillOpacity: 0.2,
          interactive: false,
        }).addTo(g);
      else if (corners[0]) dot(corners[0]);
    }
    if (mode === 'move' && moving.data) {
      dot([moving.data.lon, moving.data.lat], '#9ca3af');
      if (movePoint) {
        L.polyline([ll([moving.data.lon, moving.data.lat]), ll(movePoint)], {
          color: '#166534',
          dashArray: '3 3',
          interactive: false,
        }).addTo(g);
        dot(movePoint);
      }
    }
  }, [mode, corners, geometry, moving.data, movePoint]);

  // Centre on the asset being moved.
  useEffect(() => {
    if (map && moving.data)
      map.setView([moving.data.lat, moving.data.lon], Math.max(map.getZoom(), 20));
  }, [map, moving.data]);

  // Map clicks per mode, with a crosshair cursor while placing.
  useEffect(() => {
    if (!map) return;
    const placing = mode === 'point' || mode === 'polygon' || (mode === 'move' && !!moving.data);
    map.getContainer().style.cursor = placing ? 'crosshair' : '';
    if (placing) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    const place = (c: LngLat) => {
      if (mode === 'point') {
        const ewkt = pointEWKT(c);
        setCorners([c]);
        setGeometry({ ewkt, anchorEwkt: ewkt, polygon: false });
        setMode('form');
      } else if (mode === 'polygon') {
        setCorners((cs) => [...cs, c]);
      } else if (mode === 'move') {
        setMovePoint(c);
      }
    };
    // Plain DOM clicks on the map container: Leaflet's own click routing can drop clicks on the
    // canvas renderer or on interactive layers. Clicks on controls and the end of a drag are ignored.
    const container = map.getContainer();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: MouseEvent) => (down = { x: e.clientX, y: e.clientY });
    const onDomClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.leaflet-control, .leaflet-popup')) return;
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const p = map.mouseEventToLatLng(e);
      place([p.lng, p.lat]);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && reset();
    // While placing, bed and asset popups would open on the same click; close them.
    const onPopup = () => map.closePopup();
    if (placing) {
      map.closePopup(); // an open popup would cover the spot the user clicks next
      container.addEventListener('mousedown', onDown);
      container.addEventListener('click', onDomClick);
      map.on('popupopen', onPopup);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      container.removeEventListener('mousedown', onDown);
      container.removeEventListener('click', onDomClick);
      map.off('popupopen', onPopup);
      window.removeEventListener('keydown', onKey);
      map.getContainer().style.cursor = '';
      map.doubleClickZoom.enable();
    };
  }, [map, mode, moving.data, reset]);

  const finishPolygon = () => {
    const ewkt = polygonEWKT(corners);
    setGeometry({ ewkt, anchorEwkt: ewkt, polygon: true });
    setMode('form');
  };

  const saveMove = async () => {
    if (!moveId || !movePoint) return;
    const acc = moveAccuracy.trim() === '' ? null : Number(moveAccuracy.replace(',', '.'));
    if (acc !== null && !(acc >= 0)) return setMoveError(t('form.fixFields'));
    try {
      await moveAsset(moveId, pointEWKT(movePoint), moveSource || null, acc);
      await queryClient.invalidateQueries();
      navigate(`/assets/${moveId}`);
    } catch (e) {
      setMoveError(e instanceof Error ? e.message : String(e));
    }
  };

  if (!canEdit || !siteId) return null;
  const panel =
    'absolute end-2 top-2 z-[1001] w-80 max-w-[calc(100%-1rem)] rounded bg-white p-3 shadow-lg';

  return (
    <>
      {mode === 'idle' && (
        <div className="absolute start-14 top-2 z-[1000] flex gap-2">
          <button
            type="button"
            onClick={() => setMode('point')}
            className="rounded bg-green-800 px-3 py-1.5 text-sm font-medium text-white shadow"
          >
            {t('edit.addPoint')}
          </button>
          <button
            type="button"
            onClick={() => setMode('polygon')}
            className="rounded bg-white px-3 py-1.5 text-sm font-medium text-green-900 shadow"
          >
            {t('edit.addGroup')}
          </button>
        </div>
      )}

      {(mode === 'point' || mode === 'polygon') && (
        <div className={panel} role="status">
          <p className="text-sm">
            {mode === 'point'
              ? t('edit.clickPoint')
              : t('edit.clickCorners', { count: corners.length })}
          </p>
          <div className="mt-2 flex gap-3">
            {mode === 'polygon' && (
              <>
                <button
                  type="button"
                  disabled={distinctCorners(corners) < 3}
                  onClick={finishPolygon}
                  className="rounded bg-green-800 px-3 py-1 text-sm text-white disabled:opacity-50"
                >
                  {t('edit.finish')}
                </button>
                <button
                  type="button"
                  disabled={!corners.length}
                  onClick={() => setCorners((cs) => cs.slice(0, -1))}
                  className="text-sm underline disabled:opacity-50"
                >
                  {t('edit.undo')}
                </button>
              </>
            )}
            <button type="button" onClick={reset} className="text-sm underline">
              {t('form.cancel')}
            </button>
          </div>
        </div>
      )}

      {mode === 'form' && geometry && (
        <div className={`${panel} bottom-2 overflow-auto`}>
          <h2 className="mb-2 font-semibold">
            {geometry.polygon ? t('edit.newGroup') : t('form.createTitle')}
          </h2>
          <AssetForm
            orgId={orgId}
            siteId={siteId}
            geometry={geometry}
            onCancel={reset}
            onSaved={async (id) => {
              await queryClient.invalidateQueries();
              navigate(`/assets/${id}`);
            }}
          />
        </div>
      )}

      {mode === 'move' && (
        <div className={panel}>
          <h2 className="font-semibold">
            {t('edit.moveTitle')}{' '}
            <span className="font-mono" dir="ltr">
              {moving.data?.tag_code ?? ''}
            </span>
          </h2>
          {moving.data === null && <p className="text-sm text-red-700">{t('assets.notFound')}</p>}
          <p className="mt-1 text-sm">
            {movePoint ? formatLatLon(movePoint[1], movePoint[0]) : t('edit.clickNewPosition')}
          </p>
          {movePoint && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <label className="flex flex-col">
                {t('form.positionSource')}
                <select
                  value={moveSource}
                  onChange={(e) => setMoveSource(e.target.value)}
                  className="rounded border border-gray-300 px-1 py-1"
                >
                  <option value="" />
                  {POSITION_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`position.${s}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col">
                {t('form.accuracy')}
                <input
                  dir="ltr"
                  inputMode="decimal"
                  value={moveAccuracy}
                  onChange={(e) => setMoveAccuracy(e.target.value)}
                  className="rounded border border-gray-300 px-1 py-1"
                />
              </label>
            </div>
          )}
          {moveError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {moveError}
            </p>
          )}
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              disabled={!movePoint}
              onClick={() => void saveMove()}
              className="rounded bg-green-800 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              {t('edit.saveMove')}
            </button>
            <button
              type="button"
              onClick={() => (moveId ? navigate(`/assets/${moveId}`) : reset())}
              className="text-sm underline"
            >
              {t('form.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
