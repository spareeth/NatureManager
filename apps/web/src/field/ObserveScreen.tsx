import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/context';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { db } from '../offline/db';
import { useOutbox } from '../offline/outbox';
import { VoiceNote } from '../components/VoiceNote';
import { supabase } from '../lib/supabase';
import {
  fetchMyObservations,
  fetchPlaces,
  fieldsFor,
  observationProblems,
  OBS_TYPES,
  PHENOPHASES,
  queueObservation,
  type ObsType,
} from './observe';

const BTN =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-lg font-semibold';
const LIFE_STAGES = ['adult', 'juvenile', 'egg_or_larva', 'unknown'];

/** Tag and point of an asset from the server (when the phone has no copy of it). */
async function scanAsset(id: string) {
  const { data, error } = await supabase.rpc('field_scan', { p_asset: id });
  if (error || !data) return null;
  return data as unknown as { tag_code: string; lat: number | null; lon: number | null };
}

type Point = { lat: number; lon: number; accuracy: number | null; source: 'gps' | 'asset' | 'bed' };

/** New observation in three taps (FR-FLD-05): Observe, a type, Save. GPS is taken as the screen opens. */
export function ObserveScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const [params] = useSearchParams();
  const assetId = params.get('asset');
  const queryClient = useQueryClient();
  const outbox = useOutbox();

  const [type, setType] = useState<ObsType | null>(null);
  const [point, setPoint] = useState<Point | null>(null);
  const [gps, setGps] = useState<'finding' | 'ok' | 'failed'>('finding');
  const [placeId, setPlaceId] = useState('');
  const [assetTag, setAssetTag] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [lifeStage, setLifeStage] = useState('');
  const [phenophase, setPhenophase] = useState('');
  const [severity, setSeverity] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const places = useQuery({
    queryKey: ['field-places', site?.id],
    enabled: !!site,
    queryFn: () => fetchPlaces(site!.id),
  });
  const mine = useQuery({
    queryKey: ['my-observations', site?.id],
    enabled: !!site && !!session,
    queryFn: () => fetchMyObservations(site!.id, session!.user.id),
  });
  const queued = outbox.filter((i) => i.kind === 'observation' && i.status === 'pending');

  // Linked asset (from a scan): its point, from the phone's copy or the server; otherwise the phone's GPS.
  useEffect(() => {
    let live = true;
    const findGps = () => {
      if (!('geolocation' in navigator)) {
        if (live) setGps('failed');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!live) return;
          setPoint({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            source: 'gps',
          });
          setGps('ok');
        },
        () => live && setGps('failed'),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
      );
    };
    if (!assetId) {
      findGps();
    } else {
      void (async () => {
        const cached = await db.assets.get(assetId);
        const a = cached?.lat != null ? cached : await scanAsset(assetId).catch(() => null);
        if (!live) return;
        if (a && a.lat != null && a.lon != null) {
          setAssetTag(a.tag_code);
          setPoint({ lat: a.lat, lon: a.lon, accuracy: null, source: 'asset' });
          setGps('ok');
        } else findGps();
      })();
    }
    return () => {
      live = false;
    };
  }, [assetId]);

  const chosenPlace = (places.data ?? []).find((p) => p.id === placeId);
  const where: Point | null =
    point ??
    (chosenPlace
      ? {
          lat: Number(chosenPlace.lat),
          lon: Number(chosenPlace.lon),
          accuracy: null,
          source: 'bed',
        }
      : null);
  const problems = type
    ? observationProblems({ obsType: type, phenophase: phenophase || null }, !!where)
    : [];
  const f = type ? fieldsFor(type) : null;

  const reset = () => {
    setType(null);
    setCount(null);
    setLifeStage('');
    setPhenophase('');
    setSeverity(null);
    setNotes('');
    setPhotos([]);
    setAudio(null);
  };
  const save = async () => {
    if (!type || !where || !current || !site || problems.length) return;
    setBusy(true);
    try {
      await queueObservation(
        {
          orgId: current.organisationId,
          siteId: site.id,
          obsType: type,
          lat: where.lat,
          lon: where.lon,
          accuracy: where.accuracy,
          locationId: where.source === 'bed' ? placeId : null,
          assetId: assetId ?? null,
          count,
          lifeStage: lifeStage || null,
          phenophase: phenophase || null,
          severity,
          notes: notes.trim() || null,
        },
        photos,
        audio,
      );
      reset();
      setSaved(true);
      void queryClient.invalidateQueries({ queryKey: ['my-observations'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-4 p-3 pb-24 text-base">
      <Link to="/field" className="inline-flex min-h-12 items-center text-green-900 underline">
        ‹ {t('fieldApp.myDay')}
      </Link>
      <h1 className="text-xl font-semibold">{t('obs.heading')}</h1>

      <p className="text-sm text-gray-700" data-testid="obs-where">
        {where?.source === 'asset'
          ? t('obs.atAsset', { tag: assetTag })
          : where?.source === 'gps'
            ? t('obs.gpsOk', { m: where.accuracy })
            : where?.source === 'bed'
              ? t('obs.atBed', { code: chosenPlace?.code })
              : gps === 'finding'
                ? t('obs.gpsFinding')
                : t('obs.gpsFailed')}
      </p>
      {gps === 'failed' && !assetId && (
        <label className="block">
          {t('obs.choosePlace')}
          <select
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
          >
            <option value="">-</option>
            {(places.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </label>
      )}

      {saved && !type && (
        <p role="status" className="rounded bg-green-50 p-2 text-green-900">
          {t('obs.saved')}
        </p>
      )}

      {!type ? (
        <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('obs.type')}>
          {OBS_TYPES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setSaved(false);
                setType(o);
              }}
              className="min-h-20 rounded-lg border-2 border-gray-300 bg-white p-3 text-start text-lg font-semibold active:bg-gray-100"
            >
              {t(`obs.types.${o}`)}
              <span className="block text-sm font-normal text-gray-600">
                {t(`obs.typeHelp.${o}`)}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{t(`obs.types.${type}`)}</h2>
            <button
              type="button"
              onClick={() => setType(null)}
              className="ms-auto min-h-12 underline"
            >
              {t('obs.changeType')}
            </button>
          </div>

          {f?.phenophase && (
            <fieldset>
              <legend>{t('obs.phenophase')}</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {PHENOPHASES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={phenophase === p}
                    onClick={() => setPhenophase(p)}
                    className={`${BTN} ${phenophase === p ? 'bg-green-800 text-white' : 'border-2'}`}
                  >
                    {t(`obs.phenophases.${p}`)}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {f?.severity && (
            <fieldset>
              <legend>{t('obs.severity')}</legend>
              <div className="mt-1 flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={severity === n}
                    aria-label={t('obs.severityN', { n })}
                    onClick={() => setSeverity(n)}
                    className={`${BTN} flex-1 ${severity === n ? 'bg-green-800 text-white' : 'border-2'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-sm text-gray-600">{t('obs.severityHelp')}</p>
            </fieldset>
          )}
          {f?.count && (
            <div className="flex items-center gap-3">
              <span>{t('obs.count')}</span>
              <button
                type="button"
                aria-label={t('obs.less')}
                onClick={() => setCount((c) => (c && c > 1 ? c - 1 : null))}
                className={`${BTN} border-2`}
              >
                −
              </button>
              <span className="min-w-8 text-center text-xl font-semibold" data-testid="obs-count">
                {count ?? '-'}
              </span>
              <button
                type="button"
                aria-label={t('obs.more')}
                onClick={() => setCount((c) => (c ?? 0) + 1)}
                className={`${BTN} border-2`}
              >
                +
              </button>
            </div>
          )}
          {f?.lifeStage && (
            <label className="block">
              {t('obs.lifeStage')}
              <select
                value={lifeStage}
                onChange={(e) => setLifeStage(e.target.value)}
                className="mt-1 block min-h-12 w-full rounded border-2 px-2 text-lg"
              >
                <option value="">-</option>
                {LIFE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(`obs.lifeStages.${s}`)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {photos.map((_photo, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-sm"
              >
                {t('obs.photoN', { n: i + 1 })}
                <button
                  type="button"
                  aria-label={t('wo.removePhoto')}
                  onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}
                  className="min-h-12 min-w-8"
                >
                  ×
                </button>
              </span>
            ))}
            {photos.length < 3 && (
              <label className={`${BTN} cursor-pointer border-2`}>
                {t('obs.takePhoto')}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) setPhotos((ps) => [...ps, file].slice(0, 3));
                  }}
                />
              </label>
            )}
          </div>
          {f?.audio && <VoiceNote value={audio} onChange={setAudio} />}

          <label className="block">
            {t('obs.notes')}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block min-h-20 w-full rounded border-2 p-2 text-lg"
            />
          </label>

          {problems.length > 0 && (
            <p role="note" className="text-amber-900">
              {problems.map((p) => t(`obs.problem.${p}`)).join(' ')}
            </p>
          )}
          <button
            type="button"
            disabled={busy || problems.length > 0}
            onClick={() => void save()}
            className={`${BTN} w-full bg-green-800 text-white disabled:opacity-50`}
          >
            {t('obs.save')}
          </button>
        </div>
      )}

      {!type && (
        <section aria-labelledby="obs-mine" className="space-y-2">
          <h2 id="obs-mine" className="font-semibold">
            {t('obs.mine')}
          </h2>
          <ul className="space-y-2" data-testid="my-observations">
            {queued.map((q) => (
              <li key={q.id} className="rounded border-2 border-dashed border-gray-400 p-2">
                {t(`obs.types.${String(q.payload.obsType)}`)} ·{' '}
                <span className="text-amber-800">{t('fieldApp.waitingToSend')}</span>
              </li>
            ))}
            {(mine.data ?? []).map((o) => (
              <li key={o.id} className="rounded border-2 p-2">
                <span className="font-semibold">{t(`obs.types.${o.obs_type}`)}</span>
                {o.location?.code && ` · ${o.location.code}`}
                {o.count != null && ` · ${o.count}`}
                <span className="block text-sm text-gray-600">
                  {new Date(o.observed_at).toLocaleString(i18n.language, {
                    timeZone: 'Asia/Dubai',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}{' '}
                  · {t(`obs.verification.${o.verification}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
