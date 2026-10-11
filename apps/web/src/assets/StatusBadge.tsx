import { useTranslation } from 'react-i18next';
import { statusColour } from '../map/style';

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: statusColour(status) }}
      />
      {t(`status.${status}`)}
    </span>
  );
}
