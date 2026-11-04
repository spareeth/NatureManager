import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentSite } from '../org/useSite';
import { useOutbox } from '../offline/outbox';
import { PriorityTag, StatusPill } from '../work/badges';
import { fetchFieldRequests, NotOffline, type MyRequest, type OpenRequest } from './api';
import { PlaceFilterBar } from '../components/PlaceFilterBar';
import { ALL_PLACES, groupByPlace, placeMatches, zoneOf, type PlaceFilter } from '../work/places';

const TAB = 'min-h-12 flex-1 rounded';

/** Requests in the field app: open ones on the site (everyone) and the ones I raised, with status. */
export function RequestsScreen() {
  const { t, i18n } = useTranslation();
  const { site } = useCurrentSite();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'open';
  const data = useQuery({
    queryKey: ['field-requests', site?.id],
    enabled: !!site,
    queryFn: () => fetchFieldRequests(site!.id),
  });
  const outbox = useOutbox();
  // Requests raised on this phone and not yet sent show at the top of "Mine".
  const queued = outbox.filter((i) => i.kind === 'request' && i.status === 'pending');
  const open = data.data?.data.open ?? [];
  const mine = data.data?.data.mine ?? [];
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceFilter>(ALL_PLACES);
  const heading = (code: string | null) =>
    code === null
      ? t('places.none')
      : code.includes('-')
        ? `${code} · ${t(`map.zones.${zoneOf(code)}`)}`
        : t(`map.zones.${code}`, { defaultValue: code });
  const match = (s: string | null | undefined) =>
    !query || (s ?? '').toLowerCase().includes(query.toLowerCase());
  const when = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      timeZone: 'Asia/Dubai',
      day: 'numeric',
      month: 'short',
    });

  return (
    <section className="mx-auto max-w-xl space-y-3 p-3 pb-24 text-base">
      <Link to="/field" className="inline-flex min-h-12 items-center text-green-900 underline">
        ‹ {t('fieldApp.myDay')}
      </Link>
      <h1 className="text-xl font-semibold">{t('fieldReq.heading')}</h1>
      <div className="flex gap-2" role="tablist">
        {(['open', 'mine'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setParams({ tab: v }, { replace: true })}
            className={`${TAB} ${tab === v ? 'bg-green-800 text-white' : 'border-2'}`}
          >
            {t(`fieldReq.tab.${v}`, {
              count: v === 'open' ? open.length : mine.length + queued.length,
            })}
          </button>
        ))}
      </div>
      <input
        aria-label={t('fieldReq.search')}
        placeholder={t('fieldReq.search')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="min-h-12 w-full rounded border-2 px-2"
      />
      {data.data && (
        <PlaceFilterBar
          large
          value={place}
          onChange={setPlace}
          codes={(tab === 'open' ? open : mine).map((r) => r.location_code)}
        />
      )}
      {data.error && (
        <p role="alert" className="text-red-700">
          {data.error instanceof NotOffline ? t('fieldApp.notOffline') : data.error.message}
        </p>
      )}
      {data.isPending && site && <p>{t('common.loading')}</p>}

      {tab === 'open' && data.data && (
        <>
          <p className="text-sm text-gray-700">{t('fieldReq.openHelp')}</p>
          {open.length === 0 && <p className="text-gray-700">{t('fieldReq.noneOpen')}</p>}
          <div className="space-y-3" data-testid="open-requests">
            {groupByPlace(
              open.filter(
                (r) =>
                  placeMatches(r.location_code, place) &&
                  (match(r.title) || match(r.location_code) || match(r.number)),
              ),
              (r) => r.location_code,
            ).map(([code, rows]) => (
              <section key={code ?? 'none'} aria-label={heading(code)}>
                <h2 className="mb-1 text-sm font-semibold text-gray-700">
                  {heading(code)} ({rows.length})
                </h2>
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <OpenCard r={r} when={when(r.created_at)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      {tab === 'mine' && data.data && (
        <>
          {queued.length + mine.length === 0 && (
            <p className="text-gray-700">{t('fieldReq.noneMine')}</p>
          )}
          <ul className="space-y-2" data-testid="my-requests">
            {queued.map((q) => (
              <li key={q.id} className="rounded-lg border-2 border-dashed border-gray-400 p-3">
                <p className="font-semibold">{String(q.payload.title ?? '')}</p>
                <p className="text-sm text-amber-800">{t('fieldApp.waitingToSend')}</p>
              </li>
            ))}
            {mine
              .filter(
                (r) =>
                  placeMatches(r.location_code, place) &&
                  (match(r.title) || match(r.location_code) || match(r.number)),
              )
              .map((r) => (
                <li key={`${r.kind}-${r.id}`}>
                  <MineCard r={r} when={when(r.created_at)} />
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

function OpenCard({ r, when }: { r: OpenRequest; when: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/field/jobs/${r.id}`}
      className="block min-h-12 rounded-lg border-2 border-gray-300 bg-white p-3 active:bg-gray-100"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">{r.location_code ?? '-'}</span>
        <PriorityTag priority={r.priority} />
        {r.wo_type === 'project' && (
          <span className="rounded bg-indigo-100 px-1 text-xs text-indigo-900">
            {t('wo.kind.project')}
          </span>
        )}
        <span className="ms-auto">
          <StatusPill status={r.status} />
        </span>
      </div>
      <p className="mt-1 text-lg">{r.title}</p>
      <p className="text-sm text-gray-700">
        {r.number} ·{' '}
        {r.mine ? t('fieldReq.byMe') : t('fieldReq.by', { name: r.created_by_name ?? '-' })} ·{' '}
        {when}
      </p>
    </Link>
  );
}

function MineCard({ r, when }: { r: MyRequest; when: string }) {
  const { t, i18n } = useTranslation();
  const status =
    r.kind === 'work'
      ? r.status === 'scheduled' && r.planned_start
        ? t('fieldReq.scheduledFor', {
            day: new Date(r.planned_start).toLocaleDateString(i18n.language, {
              timeZone: 'Asia/Dubai',
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }),
          })
        : t(`wo.status.${r.status}`)
      : t(`ir.status.${r.status}`);
  const bad = ['cancelled', 'rejected', 'rejected_by_receiver'].includes(r.status);
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-gray-100 px-1 text-xs">
          {r.kind === 'work' ? t('fieldReq.work') : t('fieldReq.items')}
        </span>
        <span className="font-mono text-sm">{r.number}</span>
        <span
          className={`ms-auto text-sm font-semibold ${bad ? 'text-red-800' : 'text-green-900'}`}
        >
          {status}
        </span>
      </div>
      <p className="mt-1 text-lg">{r.title ?? '-'}</p>
      <p className="text-sm text-gray-700">
        {r.location_code ?? '-'} · {when}
      </p>
      {r.note && (
        <p className={`mt-1 text-sm ${bad ? 'text-red-800' : 'text-gray-700'}`}>
          {t('fieldReq.note')}: {r.note}
        </p>
      )}
    </>
  );
  return r.kind === 'work' ? (
    <Link
      to={`/field/jobs/${r.id}`}
      className="block min-h-12 rounded-lg border-2 border-gray-300 bg-white p-3 active:bg-gray-100"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-lg border-2 border-gray-300 bg-white p-3">{body}</div>
  );
}
