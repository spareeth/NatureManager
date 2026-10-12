import { useTranslation } from 'react-i18next';
import { PRIORITY_COLOURS, STATUS_COLOURS, type BoardItem, type WoStatus } from './model';

export function StatusPill({ status }: { status: WoStatus }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs">
      <span
        aria-hidden
        className="h-2 w-2 rounded-full"
        style={{ background: STATUS_COLOURS[status] }}
      />
      {t(`wo.status.${status}`)}
    </span>
  );
}

export function PriorityTag({ priority }: { priority: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-xs font-semibold text-white"
      style={{ background: PRIORITY_COLOURS[priority] ?? '#64748b' }}
    >
      {priority}
    </span>
  );
}

/** SLA and overdue flags (FR-WO-11). */
export function WoFlags({ item }: { item: Pick<BoardItem, 'sla_breached' | 'overdue'> }) {
  const { t } = useTranslation();
  return (
    <>
      {item.sla_breached && (
        <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">
          {t('wo.slaBreached')}
        </span>
      )}
      {item.overdue && (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">
          {t('wo.overdue')}
        </span>
      )}
    </>
  );
}
