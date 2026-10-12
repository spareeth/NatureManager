import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { bulkMove, fetchBoard, replan, transition } from '../work/api';
import { addDays, dubaiDate, dubaiInstant, weekStart, type WoStatus } from '../work/model';
import { BoardView, CalendarView, InboxView, WorkMapView } from '../work/views';
import { RequestForm } from '../work/RequestForm';

const VIEWS = ['inbox', 'board', 'calendar', 'map'] as const;
type View = (typeof VIEWS)[number];

export function WorkPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const planner = !!current?.roles.some((r) => r === 'manager' || r === 'field_manager');
  const view = (VIEWS as readonly string[]).includes(params.get('view') ?? '')
    ? (params.get('view') as View)
    : planner
      ? 'inbox'
      : 'inbox';
  const week = params.get('week') ?? weekStart(dubaiDate(new Date()));
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const board = useQuery({
    queryKey: ['wo-board', site?.id, view, week],
    enabled: !!site,
    queryFn: () =>
      view === 'inbox'
        ? fetchBoard(site!.id, { status: ['requested', 'approved'] })
        : view === 'calendar'
          ? fetchBoard(site!.id, {
              from: dubaiInstant(week, '00:00'),
              to: dubaiInstant(addDays(week, 7), '00:00'),
            })
          : fetchBoard(site!.id, { openOnly: true }),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['wo-board'] });
  const act = async <T,>(fn: () => Promise<T>, ok: string | ((result: T) => string)) => {
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ kind: 'ok', text: typeof ok === 'function' ? ok(result) : ok });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      await refresh();
    }
  };
  const onTransition = (id: string, to: WoStatus) =>
    void act(() => transition(id, to), t('wo.moved', { status: t(`wo.status.${to}`) }));
  const setView = (v: View) =>
    setParams(
      (p) => {
        p.set('view', v);
        return p;
      },
      { replace: true },
    );

  if (!current || !site) return <p className="p-4">{t('common.loading')}</p>;
  return (
    <section className="flex h-full flex-col p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('wo.heading')}</h1>
        {planner && (
          <nav aria-label={t('wo.views')} className="flex gap-1 text-sm">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded px-3 py-1 ${view === v ? 'bg-green-800 text-white' : 'border'}`}
              >
                {t(`wo.view.${v}`)}
              </button>
            ))}
          </nav>
        )}
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="ms-auto rounded border border-green-800 px-3 py-1 text-sm text-green-900"
        >
          {t('wo.report')}
        </button>
      </div>
      {reporting && (
        <div className="mt-3 max-w-lg">
          <RequestForm
            orgId={current.organisationId}
            siteId={site.id}
            onCancel={() => setReporting(false)}
            onDone={(wo) => {
              setReporting(false);
              void refresh();
              navigate(`/work/${wo.id}`);
            }}
          />
        </div>
      )}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 rounded px-2 py-1 text-sm ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}
        >
          {message.text}
        </p>
      )}
      {board.error && (
        <p role="alert" className="mt-2 text-red-700">
          {board.error.message}
        </p>
      )}
      <div className="mt-3 min-h-0 flex-1">
        {!planner || view === 'inbox' ? (
          <>
            {!planner && <p className="mb-2 text-sm text-gray-600">{t('wo.openRequests')}</p>}
            <InboxView
              items={(board.data ?? []).filter((i) => planner || i.status === 'requested')}
              orgId={current.organisationId}
              onTransition={onTransition}
              onChanged={() => void refresh()}
            />
          </>
        ) : view === 'board' ? (
          <BoardView items={board.data ?? []} onTransition={onTransition} />
        ) : view === 'calendar' ? (
          <CalendarView
            items={board.data ?? []}
            week={week}
            onWeek={(w) =>
              setParams(
                (p) => {
                  p.set('week', w);
                  return p;
                },
                { replace: true },
              )
            }
            onReplan={(id, start) => void act(() => replan(id, start), t('wo.replanned'))}
            onBulkMove={(from, to) =>
              void act(
                () => bulkMove(site.id, from, to),
                (n) => t('wo.bulkMoved', { count: n, to }),
              )
            }
          />
        ) : (
          <WorkMapView items={board.data ?? []} />
        )}
      </div>
    </section>
  );
}
