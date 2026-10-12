import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { fetchAllowed, fetchWorkOrder, transition } from '../work/api';
import { PriorityTag, StatusPill } from '../work/badges';
import { ScheduleForm } from '../work/ScheduleForm';
import type { WoStatus } from '../work/model';

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 border-b py-1.5 text-sm">
      <dt className="text-gray-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function WorkOrderPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const queryClient = useQueryClient();
  const [noteFor, setNoteFor] = useState<WoStatus | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const wo = useQuery({ queryKey: ['wo', id], enabled: !!id, queryFn: () => fetchWorkOrder(id!) });
  const allowed = useQuery({
    queryKey: ['wo-allowed', id, wo.data?.status],
    enabled: !!wo.data,
    queryFn: () => fetchAllowed(id!),
  });

  if (wo.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (!wo.data || !current) return <p className="p-4">{t('wo.notFound')}</p>;
  const w = wo.data;
  const when = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(i18n.language, {
          dateStyle: 'medium',
          timeStyle: 'short',
          timeZone: 'Asia/Dubai',
        }).format(new Date(iso))
      : '';
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['wo'] });
    await queryClient.invalidateQueries({ queryKey: ['wo-allowed'] });
    await queryClient.invalidateQueries({ queryKey: ['wo-board'] });
  };
  const go = async (to: WoStatus, n?: string) => {
    setError(null);
    try {
      await transition(w.id, to, n);
      setNoteFor(null);
      setNote('');
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const planner = current.roles.some((r) => r === 'manager' || r === 'field_manager');
  const canSchedule = planner && (w.status === 'requested' || w.status === 'approved');

  return (
    <section className="mx-auto max-w-4xl p-4">
      <Link to="/work" className="text-sm underline">
        {t('wo.back')}
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold" dir="ltr">
          {w.number}
        </h1>
        <PriorityTag priority={w.priority} />
        <StatusPill status={w.status} />
      </header>
      <p className="mt-1 text-lg">{w.title}</p>

      <div className="mt-3 flex flex-wrap gap-2" aria-label={t('wo.actions')}>
        {canSchedule && !scheduling && (
          <button
            type="button"
            onClick={() => setScheduling(true)}
            className="rounded bg-green-800 px-3 py-1 text-sm text-white"
          >
            {t('wo.schedule')}
          </button>
        )}
        {(allowed.data ?? [])
          .filter((a) => !(canSchedule && a.to_status === 'scheduled'))
          .map((a) => (
            <button
              key={a.to_status}
              type="button"
              onClick={() =>
                a.note_required || a.to_status === 'cancelled'
                  ? setNoteFor(a.to_status)
                  : void go(a.to_status)
              }
              className={`rounded px-3 py-1 text-sm ${a.to_status === 'cancelled' ? 'text-red-700 underline' : 'border border-green-800 text-green-900'}`}
            >
              {t(`wo.action.${w.status}.${a.to_status}`, {
                defaultValue: t(`wo.status.${a.to_status}`),
              })}
            </button>
          ))}
      </div>
      {scheduling && (
        <div className="mt-3">
          <ScheduleForm
            orgId={current.organisationId}
            woId={w.id}
            defaultTeam={w.team_id}
            onCancel={() => setScheduling(false)}
            onDone={() => {
              setScheduling(false);
              void refresh();
            }}
          />
        </div>
      )}
      {noteFor && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void go(noteFor, note);
          }}
        >
          <label className="min-w-64 flex-1">
            {t('wo.reason')}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
            {t('wo.confirm')}
          </button>
          <button type="button" onClick={() => setNoteFor(null)} className="underline">
            {t('form.cancel')}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 rounded bg-red-50 px-2 py-1 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-2">
        <dl>
          <Row label={t('wo.type')}>{t(`wo.types.${w.wo_type}`)}</Row>
          <Row label={t('wo.sourceLabel')}>
            {t(`wo.sources.${w.source}`)}
            {w.template_code ? ` · ${w.template_code}` : ''}
          </Row>
          <Row label={t('wo.details')}>{w.description}</Row>
          <Row label={t('wo.location')}>{w.location?.code}</Row>
          <Row label={t('wo.assets')}>
            {w.assets.length > 0 &&
              w.assets.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <Link to={`/assets/${a.id}`} className="font-mono underline" dir="ltr">
                    {a.tag_code}
                  </Link>
                </span>
              ))}
          </Row>
          <Row label={t('wo.sop')}>
            {w.sop &&
              `${w.sop.code} v${w.sop.version} · ${(i18n.language.startsWith('ar') && w.sop.title.ar) || w.sop.title.en}`}
          </Row>
        </dl>
        <dl>
          <Row label={t('wo.assignee')}>
            {[w.assignee_name, w.team_name].filter(Boolean).join(' · ')}
          </Row>
          <Row label={t('wo.planned')}>
            {w.planned_start && `${when(w.planned_start)} (${w.est_minutes ?? '?'} min)`}
          </Row>
          <Row label={t('wo.due')}>{when(w.due_at)}</Row>
          <Row label={t('wo.slaDue')}>{when(w.sla_due)}</Row>
          <Row
            label={t('wo.raised')}
          >{`${when(w.created_at)}${w.created_by_name ? ` · ${w.created_by_name}` : ''}`}</Row>
          <Row label={t('wo.actualMinutes')}>{w.actual_minutes}</Row>
          <Row label={t('wo.completionNotes')}>{w.completion_notes}</Row>
        </dl>
      </div>

      <h2 className="mt-6 font-semibold">{t('wo.history')}</h2>
      <ol className="mt-2 border-s-2 border-green-800/30 ps-4" data-testid="wo-history">
        {w.events.map((e, i) => (
          <li key={i} className="relative mb-3 text-sm">
            <span
              aria-hidden
              className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-green-800"
            />
            <p>
              {e.from
                ? t('wo.eventMove', { from: t(`wo.status.${e.from}`), to: t(`wo.status.${e.to}`) })
                : t(`wo.status.${e.to}`)}
              {e.note ? `: ${e.note}` : ''}
            </p>
            <p className="text-xs text-gray-500">
              {when(e.at)} · {e.source === 'system' ? t('wo.system') : (e.by ?? '')}
            </p>
          </li>
        ))}
        <li className="relative text-sm">
          <span
            aria-hidden
            className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-gray-400"
          />
          <p>{t('wo.raisedEvent', { status: t('wo.status.requested') })}</p>
          <p className="text-xs text-gray-500">
            {when(w.created_at)}
            {w.created_by_name ? ` · ${w.created_by_name}` : ''}
          </p>
        </li>
      </ol>
    </section>
  );
}
