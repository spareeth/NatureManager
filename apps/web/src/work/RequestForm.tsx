import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { raiseRequest } from './api';
import { uploadAttachments, type Attachments } from './media';
import { VoiceNote } from '../components/VoiceNote';

type RequestInput = Parameters<typeof raiseRequest>[0];

type Props = {
  orgId: string;
  siteId: string;
  asset?: { id: string; tag_code: string; location_id?: string | null; lon?: number; lat?: number };
  /** A spot picked on the map; its bed is found by the database. */
  point?: { lat: number; lon: number };
  onDone: (wo: { id: string; number: string }) => void;
  onCancel: () => void;
  /** How to send it; the field app queues it in the offline outbox. Default: insert now. */
  submit?: (v: RequestInput) => Promise<{ id: string; number: string }>;
  /** How to store photos and the voice note once the request exists; the field app queues them.
   *  Default: upload now. */
  attach?: (orgId: string, woId: string, a: Attachments) => Promise<void>;
  /** Beds and zones to choose from when there is no asset or point; the field app passes the copy it
   *  keeps offline. Default: read them now. */
  places?: { id: string; code: string }[];
};

/** Report a problem: any member raises a request (FR-WO-06). */
export function RequestForm({
  orgId,
  siteId,
  asset,
  point,
  onDone,
  onCancel,
  submit: send = raiseRequest,
  attach = uploadAttachments,
  places,
}: Props) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('P3');
  const [kind, setKind] = useState<'reactive' | 'project'>('reactive');
  // Up to 3 photos and one voice note.
  const [photos, setPhotos] = useState<File[]>([]);
  const [voice, setVoice] = useState<Blob | null>(null);
  // Without an asset or a map point, ask for the bed so the request shows on the map.
  const askPlace = !asset && !point;
  const [locationId, setLocationId] = useState('');
  const beds = useQuery({
    queryKey: ['request-places', siteId],
    enabled: askPlace && !places,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location')
        .select('id, code, kind')
        .eq('site_id', siteId)
        .order('code');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('wo.titleRequired'));
    setError(null);
    setBusy(true);
    try {
      const wo = await send({
        orgId,
        siteId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        woType: kind,
        assetId: asset?.id ?? null,
        locationId: asset?.location_id ?? (locationId || null),
        geom:
          asset?.lon != null && asset.lat != null
            ? `SRID=4326;POINT(${asset.lon} ${asset.lat})`
            : point
              ? `SRID=4326;POINT(${point.lon} ${point.lat})`
              : null,
      });
      if (photos.length || voice) {
        try {
          await attach(orgId, wo.id, { photos, voice });
        } catch (err) {
          // The request exists; say the attachments did not go, rather than losing the request.
          setError(t('wo.attachFailed', { message: (err as Error).message }));
          setBusy(false);
          return;
        }
      }
      onDone(wo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // 48 px on phones for the field app (FR-FLD-06).
  const input = 'w-full rounded border border-gray-300 px-2 py-1 min-h-12 sm:min-h-0';
  return (
    <form
      onSubmit={submit}
      aria-label={t('wo.reportTitle')}
      className="space-y-2 rounded border p-3 text-sm"
    >
      <h2 className="font-semibold">
        {t('wo.reportTitle')}
        {asset && (
          <span className="ms-2 font-mono font-normal" dir="ltr">
            {asset.tag_code}
          </span>
        )}
      </h2>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">{t('wo.kind.label')}</legend>
        {(['reactive', 'project'] as const).map((k) => (
          <label key={k} className="flex min-h-12 items-center gap-2 sm:min-h-0">
            <input
              type="radio"
              name="request-kind"
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {t(`wo.kind.${k}`)}
          </label>
        ))}
      </fieldset>
      {point && (
        <p className="text-gray-700" data-testid="request-point">
          {t('wo.atPoint', { lat: point.lat.toFixed(6), lon: point.lon.toFixed(6) })}
        </p>
      )}
      {askPlace && (
        <label className="block">
          {t('wo.place')}
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            className={input}
          >
            <option value="">{t('wo.placeNone')}</option>
            {(places ?? beds.data ?? []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.code}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block">
        {kind === 'project' ? t('wo.whatShouldChange') : t('wo.whatIsWrong')}
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>
      <label className="block">
        {t('wo.details')}
        <textarea
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={input}
        />
      </label>
      <label className="block">
        {t('wo.urgency')}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={input}>
          {['P1', 'P2', 'P3', 'P4'].map((p) => (
            <option key={p} value={p}>
              {t(`wo.priority.${p}`)}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="font-medium">{t('wo.attachments')}</legend>
        <div className="flex flex-wrap items-center gap-2" data-testid="request-photos">
          {photos.map((f, i) => (
            <span key={i} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-1">
              {f.name.slice(0, 18)}
              <button
                type="button"
                aria-label={t('wo.removePhoto')}
                onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}
                className="min-h-12 min-w-8 sm:min-h-0"
              >
                ×
              </button>
            </span>
          ))}
          {photos.length < 3 && (
            <label className="inline-flex min-h-12 cursor-pointer items-center rounded border-2 px-3 sm:min-h-0 sm:py-1">
              {t('wo.addPhoto')}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) setPhotos((ps) => [...ps, f].slice(0, 3));
                }}
              />
            </label>
          )}
        </div>
        <VoiceNote value={voice} onChange={setVoice} />
      </fieldset>
      <p className="text-gray-700">
        {t('wo.itemsHint')}{' '}
        <Link to="/requests" className="underline">
          {t('wo.itemsLink')}
        </Link>
      </p>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded bg-green-800 px-3 py-1 font-medium text-white disabled:opacity-60 sm:min-h-0"
        >
          {t('wo.send')}
        </button>
        <button type="button" onClick={onCancel} className="min-h-12 underline sm:min-h-0">
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
