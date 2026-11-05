import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createWorkOrderFromObservation } from '../field/observe';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { fetchPeople } from '../work/api';
import { MediaItem } from '../work/Attachments';
import { searchTaxa } from '../assets/editApi';
import {
  fetchReview,
  needsSpecies,
  rejectObservation,
  verifyObservation,
  type ReviewFilter,
  type ReviewObservation,
} from '../observations/api';

const FILTERS: ReviewFilter[] = ['pending', 'curator_verified', 'rejected', 'all'];

/** Curator review queue (FR-OBS-04): observations with their photos and AI suggestions. */
export function ObservationsPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const [filter, setFilter] = useState<ReviewFilter>('pending');
  const list = useQuery({
    queryKey: ['obs-review', site?.id, filter],
    queryFn: () => fetchReview(site!.id, filter),
    enabled: !!site,
  });
  const people = useQuery({
    queryKey: ['people', current?.organisationId],
    queryFn: () => fetchPeople(current!.organisationId),
    enabled: !!current,
  });
  const nameOf = (id: string) => people.data?.members.find((m) => m.user_id === id)?.name ?? '';

  return (
    <div className="mx-auto h-full max-w-4xl space-y-4 overflow-auto p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('obsReview.heading')}</h1>
        <label className="flex items-center gap-2">
          {t('obsReview.filter')}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ReviewFilter)}
            className="min-h-10 rounded border px-2"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`obsReview.filters.${f}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.isError && <p role="alert">{(list.error as Error).message}</p>}
      {list.data?.length === 0 && <p>{t('obsReview.none')}</p>}
      <ul className="space-y-4">
        {(list.data ?? []).map((o) => (
          <ReviewCard key={o.id} o={o} observerName={nameOf(o.observer)} />
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({ o, observerName }: { o: ReviewObservation; observerName: string }) {
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [changing, setChanging] = useState(false);
  const found = useQuery({
    queryKey: ['taxon-search', q],
    queryFn: () => searchTaxa(current!.organisationId, q),
    enabled: changing && q.trim().length > 1,
  });
  const done = () => void qc.invalidateQueries({ queryKey: ['obs-review'] });
  const verify = useMutation({
    mutationFn: (taxonId?: string | null) => verifyObservation(o.id, taxonId),
    onSuccess: done,
  });
  const reject = useMutation({ mutationFn: () => rejectObservation(o.id), onSuccess: done });
  const navigate = useNavigate();
  const makeWo = useMutation({
    mutationFn: () => createWorkOrderFromObservation(o.id),
    onSuccess: (id) => navigate(`/work/${id}`),
  });
  const err = (verify.error ?? reject.error ?? makeWo.error) as Error | null;
  const open = o.verification === 'ai_suggested' || o.verification === 'observer_confirmed';
  const speciesMissing = needsSpecies(o.obs_type) && !o.taxon_id;

  return (
    <li className="space-y-3 rounded border p-4" data-testid="obs-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {t(`obs.types.${o.obs_type}`)}
          {o.location?.code && ` · ${o.location.code}`}
          {o.asset && ` · ${t('obsReview.asset', { tag: o.asset.tag_code })}`}
        </h2>
        <span className="text-sm text-gray-700">
          {new Date(o.observed_at).toLocaleString(i18n.language, {
            timeZone: 'Asia/Dubai',
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
          {observerName && ` · ${t('obsReview.by', { name: observerName })}`} ·{' '}
          {t(`obsReview.status.${o.verification}`)}
        </span>
      </div>
      <p>
        {t('obsReview.species')}:{' '}
        {o.taxon ? <i>{o.taxon.scientific_name}</i> : t('obsReview.noSpecies')}
        {o.count != null && ` · ${t('obs.count')} ${o.count}`}
        {o.life_stage && ` · ${t(`obs.lifeStages.${o.life_stage}`)}`}
        {o.phenophase && ` · ${t(`obs.phenophases.${o.phenophase}`)}`}
        {o.severity != null && ` · ${t('obs.severityN', { n: o.severity })}`}
      </p>
      {o.notes && <p className="text-gray-800">{o.notes}</p>}
      {o.media.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {o.media.map((m) => (
            <MediaItem key={m.id} m={m} />
          ))}
        </div>
      )}
      {o.suggestions.length > 0 && (
        <div>
          <h3 className="font-semibold">{t('obsReview.suggestions')}</h3>
          <ol className="mt-1 space-y-1">
            {o.suggestions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span className="w-6 text-end tabular-nums">{s.rank}.</span>
                <i>{s.taxon_name}</i>
                <span className="text-sm text-gray-700">
                  {Math.round(s.score * 100)}% · {s.engine}
                  {s.in_collection ? ` · ${t('obs.ai.inCollection')}` : ''}
                </span>
                {open && s.taxon_id && (
                  <button
                    type="button"
                    onClick={() => verify.mutate(s.taxon_id)}
                    className="rounded border px-2 text-sm"
                  >
                    {t('obsReview.acceptAs', { name: s.taxon_name })}
                  </button>
                )}
                {!s.taxon_id && (
                  <span className="text-sm text-gray-600">({t('obsReview.noTaxon')})</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
      {changing && (
        <div className="space-y-2">
          <input
            aria-label={t('obsReview.search')}
            placeholder={t('obsReview.search')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-h-10 w-full rounded border px-2"
          />
          <ul className="space-y-1">
            {(found.data ?? []).map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => verify.mutate(x.id)}
                  className="text-start underline"
                >
                  <i>{x.scientific_name}</i>
                  {x.inhouse_code && ` (${x.inhouse_code})`}
                  {x.common_names?.en?.[0] && ` · ${x.common_names.en[0]}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={speciesMissing || verify.isPending}
            title={speciesMissing ? t('obsReview.needsSpecies') : undefined}
            onClick={() => verify.mutate(undefined)}
            className="min-h-10 rounded bg-green-800 px-4 font-semibold text-white disabled:opacity-50"
          >
            {o.taxon
              ? t('obsReview.acceptAs', { name: o.taxon.scientific_name })
              : t('obsReview.accept')}
          </button>
          <button
            type="button"
            onClick={() => setChanging((c) => !c)}
            className="min-h-10 rounded border px-4"
          >
            {t('obsReview.change')}
          </button>
          <button
            type="button"
            onClick={() => window.confirm(t('obsReview.rejectConfirm')) && reject.mutate()}
            className="min-h-10 rounded border border-red-700 px-4 text-red-800"
          >
            {t('obsReview.reject')}
          </button>
          <button
            type="button"
            disabled={makeWo.isPending}
            onClick={() => makeWo.mutate()}
            className="min-h-10 rounded border px-4"
          >
            {t('obs.wo.create')}
          </button>
          {speciesMissing && (
            <span className="text-sm text-amber-900">{t('obsReview.needsSpecies')}</span>
          )}
        </div>
      )}
      {err && <p role="alert">{err.message}</p>}
    </li>
  );
}
