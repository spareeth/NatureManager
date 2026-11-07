import { useTranslation } from 'react-i18next';
import type { IrStatus } from './api';

const COLOURS: Record<IrStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-900',
  approved: 'bg-green-100 text-green-900',
  rejected: 'bg-red-100 text-red-900',
  sent: 'bg-indigo-100 text-indigo-900',
  acknowledged: 'bg-teal-100 text-teal-900',
  rejected_by_receiver: 'bg-red-100 text-red-900',
  fulfilled: 'bg-green-200 text-green-950',
  cancelled: 'bg-gray-200 text-gray-600',
};

export function IrStatusPill({ status }: { status: IrStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOURS[status]}`}>
      {t(`ir.status.${status}`)}
    </span>
  );
}
