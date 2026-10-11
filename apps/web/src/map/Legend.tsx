import { useTranslation } from 'react-i18next';
import type { LegendItem } from './style';
import { statusColour } from './style';

const STATUSES = ['planted', 'established', 'declining', 'dead', 'active', 'out_of_service'];

export function Legend({ zones }: { zones: LegendItem[] }) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('map.legend')}
      className="absolute bottom-14 end-2 z-[999] w-44 rounded bg-white/95 p-2 text-xs text-gray-800 shadow"
    >
      <h2 className="mb-1 font-semibold">{t('map.legend')}</h2>
      <ul className="space-y-0.5">
        {zones.map((z) => (
          <li key={z.code} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-4 rounded-sm border"
              style={{ background: z.colour, borderColor: z.colour }}
            />
            <span>
              {z.code} {t(`map.zones.${z.code}`, { defaultValue: z.code })}
            </span>
          </li>
        ))}
      </ul>
      <h3 className="mb-1 mt-2 font-semibold">{t('map.assetStatus')}</h3>
      <ul className="space-y-0.5">
        {STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: statusColour(s) }}
            />
            <span>{t(`status.${s}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
