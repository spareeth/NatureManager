import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { useOutbox } from '../offline/outbox';
import { applyPending } from '../offline/overlay';
import { PriorityTag, StatusPill } from '../work/badges';
import {
  fetchJob,
  fetchVerifyQueue,
  moveJob,
  NotOffline,
  type Bilingual,
  type JobStep,
} from './api';
import { photoUrl } from './photos';

const BTN =
  'inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-lg font-semibold';
/** Supervisor checklist (FR-WO-10). The ticks are written into the verification note. */
const CHECKS = ['sop', 'photos', 'site'] as const;

const isPlanner = (roles: string[] = []) =>
  roles.includes('manager') || roles.includes('field_manager');

/** Completed jobs waiting for a supervisor. */
export function VerifyQueue() {
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const outbox = useOutbox();
  const queue = useQuery({
    queryKey: ['field-verify', site?.id],
    enabled: !!site,
    queryFn: () => fetchVerifyQueue(site!.id),
  });
  // Jobs already passed or failed on this phone and waiting to sync drop off the list.
  const decided = new Set(
    outbox.filter((i) => i.kind === 'transition' && i.status === 'pending').map((i) => i.woId),
  );
  const items = (queue.data?.data ?? []).filter((i) => !decided.has(i.id));
  if (!isPlanner(current?.roles)) return <p className="p-4">{t('verify.notAllowed')}</p>;

  return (
    <section className="mx-auto max-w-xl space-y-3 p-3 pb-24 text-base">
      <Link to="/field" className="inline-flex min-h-12 items-center text-green-900 underline">
        ‹ {t('fieldApp.myDay')}
      </Link>
      <h1 className="text-xl font-semibold">{t('verify.heading')}</h1>
      {queue.error && (
        <p role="alert" className="text-red-700">
          {queue.error instanceof NotOffline ? t('fieldApp.notOffline') : queue.error.message}
        </p>
      )}
      {queue.isPending && site && <p>{t('common.loading')}</p>}
      {queue.data && items.length === 0 && <p className="text-gray-700">{t('verify.empty')}</p>}
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.id}>
            <Link
              to={`/field/verify/${i.id}`}
              className="block min-h-12 rounded-lg border-2 border-gray-300 bg-white p-3 active:bg-gray-100"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold">{i.location_code ?? '-'}</span>
                <PriorityTag priority={i.priority} />
                {!i.can_verify && (
                  <span className="ms-auto text-sm text-amber-800">{t('verify.ownJob')}</span>
                )}
              </div>
              <p className="mt-1 text-lg">{i.title}</p>
              <p className="text-sm text-gray-700">
                {i.number} · {t('verify.doneBy', { name: i.completed_by_name ?? '-' })} ·{' '}
                {new Date(i.completed_at).toLocaleString(i18n.language, {
                  timeZone: 'Asia/Dubai',
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}{' '}
                · {t('verify.photoCount', { count: i.photos })}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Thumb({ path, blobId, alt }: { path: string | null; blobId?: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void photoUrl(path, blobId).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [path, blobId]);
  return url ? (
    <img src={url} alt={alt} className="h-24 w-24 rounded object-cover" />
  ) : (
    <span className="inline-block h-24 w-24 rounded bg-gray-200" aria-label={alt} />
  );
}

function answerText(s: JobStep, t: (k: string) => string) {
  if (s.input_type === 'photo') return null;
  if (s.input_type === 'tick') return s.value === true ? t('verify.yes') : t('verify.no');
  if (s.value === null || s.value === '') return '-';
  return `${String(s.value)}${s.unit ? ` ${s.unit}` : ''}`;
}

/** Review one completed job, tick the checklist, then pass or fail with a reason (FR-WO-10). */
export function VerifyScreen() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const navigate = useNavigate();
  const outbox = useOutbox();
  const job = useQuery({ queryKey: ['field-job', id], queryFn: () => fetchJob(id!) });
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [failing, setFailing] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const loc = (x: Bilingual | null | undefined) =>
    x ? (i18n.language.startsWith('ar') && x.ar) || x.en : '';

  if (!isPlanner(current?.roles)) return <p className="p-4">{t('verify.notAllowed')}</p>;
  if (job.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (job.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {job.error instanceof NotOffline ? t('fieldApp.notOffline') : job.error.message}
      </p>
    );
  if (!job.data.data) return <p className="p-4">{t('fieldApp.notFound')}</p>;
  const j = applyPending(job.data.data, outbox);
  const allTicked = CHECKS.every((c) => ticks[c]);
  const done = j.events.find((e) => e.to === 'completed');

  const decide = async (to: 'verified' | 'in_progress', note: string) => {
    setError(null);
    try {
      await moveJob(j, to, note);
      navigate('/field/verify', { replace: true, state: { done: j.number } });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section className="mx-auto max-w-xl space-y-4 p-3 pb-24 text-base">
      <Link
        to="/field/verify"
        className="inline-flex min-h-12 items-center text-green-900 underline"
      >
        ‹ {t('verify.heading')}
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">{j.location?.code ?? '-'}</span>
          <PriorityTag priority={j.priority} />
          <StatusPill status={j.status} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{j.title}</h1>
        <p className="text-sm text-gray-700">
          {j.number} · {t('verify.doneBy', { name: done?.by ?? j.assignee_name ?? '-' })}
        </p>
      </header>

      {j.sop && (
        <section aria-labelledby="v-sop" className="rounded-lg border-2 p-3">
          <h2 id="v-sop" className="text-lg font-semibold">
            {loc(j.sop.title)}{' '}
            <span className="text-sm font-normal text-gray-600">
              {j.sop.code} v{j.sop.version}
            </span>
          </h2>
          <ol className="mt-2 space-y-2">
            {j.steps.map((s) => (
              <li key={s.id} className="border-b pb-2 last:border-0">
                <p>
                  {s.seq}. {loc(s.text)}
                </p>
                {s.input_type === 'photo' ? (
                  s.media_id ? (
                    <Thumb path={s.media_path_answer} blobId={s.blobId} alt={loc(s.text)} />
                  ) : (
                    <p className="text-red-700">{t('verify.noPhoto')}</p>
                  )
                ) : (
                  <p className="font-semibold">{answerText(s, t)}</p>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="v-record" className="rounded-lg border-2 p-3">
        <h2 id="v-record" className="text-lg font-semibold">
          {t('fieldApp.record')}
        </h2>
        <p className="mt-1 whitespace-pre-line">{j.completion_notes || '-'}</p>
        <p className="text-sm text-gray-700">
          {t('fieldApp.minutes')}: {j.actual_minutes ?? '-'}
        </p>
        {j.materials.length > 0 && (
          <ul className="mt-1 list-disc ps-5">
            {j.materials.map((m, k) => (
              <li key={k}>
                {m.item} {m.qty ?? ''} {m.unit ?? ''}
              </li>
            ))}
          </ul>
        )}
        {j.photos.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {j.photos.map((p) => (
              <Thumb key={p.id} path={p.path} blobId={p.blobId} alt={p.caption ?? ''} />
            ))}
          </div>
        )}
      </section>

      {j.status !== 'completed' ? (
        <p role="status" className="rounded bg-gray-100 p-2">
          {t('verify.notCompleted', { status: t(`wo.status.${j.status}`) })}
        </p>
      ) : j.mine || done?.by === current?.displayName ? (
        <p role="status" className="rounded bg-amber-50 p-2 text-amber-900">
          {t('verify.ownJobLong')}
        </p>
      ) : (
        <section
          aria-labelledby="v-check"
          className="space-y-2 rounded-lg border-2 border-green-800 p-3"
        >
          <h2 id="v-check" className="text-lg font-semibold">
            {t('verify.checklist')}
          </h2>
          {CHECKS.map((c) => (
            <label key={c} className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                className="h-8 w-8"
                checked={!!ticks[c]}
                onChange={(e) => setTicks((x) => ({ ...x, [c]: e.target.checked }))}
              />
              {t(`verify.check.${c}`)}
            </label>
          ))}
          <button
            type="button"
            disabled={!allTicked}
            onClick={() =>
              void decide(
                'verified',
                `${t('verify.checklist')}: ${CHECKS.map((c) => t(`verify.check.${c}`)).join('; ')}`,
              )
            }
            className={`${BTN} w-full bg-green-800 text-white disabled:opacity-50`}
          >
            {t('verify.pass')}
          </button>
          {failing ? (
            <form
              aria-label={t('verify.fail')}
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reason.trim()) void decide('in_progress', reason.trim());
              }}
            >
              <label className="block">
                {t('verify.reason')}
                <textarea
                  required
                  className="mt-1 block min-h-24 w-full rounded border-2 p-2 text-lg"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!reason.trim()}
                  className={`${BTN} flex-1 bg-red-700 text-white disabled:opacity-50`}
                >
                  {t('verify.sendBack')}
                </button>
                <button
                  type="button"
                  onClick={() => setFailing(false)}
                  className={`${BTN} border-2`}
                >
                  {t('verify.cancel')}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setFailing(true)}
              className={`${BTN} w-full border-2 border-red-700 text-red-800`}
            >
              {t('verify.fail')}
            </button>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
