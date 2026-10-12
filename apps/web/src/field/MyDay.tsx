import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import L from 'leaflet';
import { LeafletMap } from '../components/LeafletMap';
import { useCurrentSite } from '../org/useSite';
import { addDays, dubaiDate, STATUS_COLOURS } from '../work/model';
import { PriorityTag, StatusPill } from '../work/badges';
import { fetchMyDay, type DayJob } from './api';

const TOUCH = 'min-h-12 min-w-12';

/** "My day" (FR-FLD-01): today's jobs sorted by location, with a map. */
export function MyDay() {
  const { t } = useTranslation();
  const { site } = useCurrentSite();
  const [day, setDay] = useState(() => dubaiDate(new Date()));
  const [showMap, setShowMap] = useState(false);
  const jobs = useQuery({
    queryKey: ['field-day', site?.id, day],
    enabled: !!site,
    queryFn: () => fetchMyDay(site!.id, day),
  });
  const today = dubaiDate(new Date());

  return (
    <section className="mx-auto flex h-full max-w-xl flex-col p-3 text-base">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={`${TOUCH} rounded border px-3`}
          aria-label={t('fieldApp.previousDay')}
          onClick={() => setDay(addDays(day, -1))}
        >
          ‹
        </button>
        <h1 className="flex-1 text-center text-xl font-semibold">
          {day === today ? t('fieldApp.myDay') : day}
        </h1>
        <button
          type="button"
          className={`${TOUCH} rounded border px-3`}
          aria-label={t('fieldApp.nextDay')}
          onClick={() => setDay(addDays(day, 1))}
        >
          ›
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          aria-pressed={!showMap}
          onClick={() => setShowMap(false)}
          className={`${TOUCH} flex-1 rounded ${!showMap ? 'bg-green-800 text-white' : 'border'}`}
        >
          {t('fieldApp.list')}
        </button>
        <button
          type="button"
          aria-pressed={showMap}
          onClick={() => setShowMap(true)}
          className={`${TOUCH} flex-1 rounded ${showMap ? 'bg-green-800 text-white' : 'border'}`}
        >
          {t('fieldApp.map')}
        </button>
      </div>
      {jobs.error && (
        <p role="alert" className="mt-2 text-red-700">
          {jobs.error.message}
        </p>
      )}
      {jobs.isPending && site && <p className="mt-3">{t('common.loading')}</p>}
      {jobs.data && jobs.data.length === 0 && (
        <p className="mt-6 text-center text-gray-700">{t('fieldApp.noJobs')}</p>
      )}
      {jobs.data && jobs.data.length > 0 && (
        <div className="mt-3 min-h-0 flex-1">
          {showMap ? <DayMap jobs={jobs.data} /> : <JobList jobs={jobs.data} />}
        </div>
      )}
    </section>
  );
}

function JobList({ jobs }: { jobs: DayJob[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-2">
      {jobs.map((j) => (
        <li key={j.id}>
          <Link
            to={`/field/jobs/${j.id}`}
            className="block min-h-12 rounded-lg border-2 border-gray-300 bg-white p-3 active:bg-gray-100"
          >
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{j.location_code ?? '-'}</span>
              <PriorityTag priority={j.priority} />
              <span className="ms-auto">
                <StatusPill status={j.status} />
              </span>
            </div>
            <p className="mt-1 text-lg">{j.title}</p>
            <p className="text-sm text-gray-700">
              {j.number}
              {j.steps > 0 && ` · ${t('fieldApp.stepsDone', { done: j.answered, total: j.steps })}`}
              {!j.mine && ` · ${t('fieldApp.teamJob')}`}
              {j.overdue && (
                <span className="ms-1 font-semibold text-red-700">{t('wo.overdue')}</span>
              )}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DayMap({ jobs }: { jobs: DayJob[] }) {
  const layer = useRef<L.LayerGroup | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const onReady = useCallback((m: L.Map | null) => {
    setMap(m);
    if (!m) return;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
  }, []);
  useEffect(() => {
    const g = layer.current;
    if (!map || !g) return;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const j of jobs) {
      if (j.lat == null || j.lon == null) continue;
      pts.push([j.lat, j.lon]);
      L.circleMarker([j.lat, j.lon], {
        radius: 12,
        weight: 3,
        color: '#fff',
        fillColor: STATUS_COLOURS[j.status],
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>${j.location_code ?? ''}</strong> ${j.title.replace(/</g, '&lt;')}<br><a href="/field/jobs/${j.id}">${j.number}</a>`,
        )
        .addTo(g);
    }
    if (pts.length) map.fitBounds(pts, { maxZoom: 19, padding: [30, 30] });
  }, [map, jobs]);
  return (
    <LeafletMap onReady={onReady} preferCanvas={false} className="h-[60vh] w-full rounded border" />
  );
}
