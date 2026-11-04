import { useTranslation } from 'react-i18next';
import { ZONES, bedsIn, type PlaceFilter } from '../work/places';

/** Garden chips (All, East, North, South, West, No place) and a bed picker. `large` for the field app. */
export function PlaceFilterBar({
  value,
  onChange,
  codes,
  large = false,
}: {
  value: PlaceFilter;
  onChange: (f: PlaceFilter) => void;
  codes: (string | null | undefined)[];
  large?: boolean;
}) {
  const { t } = useTranslation();
  const chip = large ? 'min-h-12 px-3' : 'px-2 py-0.5';
  const zones = ['', ...ZONES, 'none'];
  const count = (z: string) =>
    codes.filter((c) => (z === '' ? true : z === 'none' ? !c : !!c && c.split('-')[0] === z))
      .length;
  const beds = value.zone && value.zone !== 'none' ? bedsIn(codes, value.zone) : [];
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('places.label')}>
      {zones.map((z) => (
        <button
          key={z || 'all'}
          type="button"
          aria-pressed={value.zone === z}
          onClick={() => onChange({ zone: z, bed: '' })}
          className={`${chip} rounded-full text-sm ${value.zone === z ? 'bg-green-800 text-white' : 'border bg-white'}`}
        >
          {z === '' ? t('places.all') : z === 'none' ? t('places.none') : t(`map.zones.${z}`)} (
          {count(z)})
        </button>
      ))}
      {beds.length > 0 && (
        <label className="ms-1 flex items-center gap-1 text-sm">
          {t('places.bed')}
          <select
            value={value.bed}
            onChange={(e) => onChange({ ...value, bed: e.target.value })}
            className={`rounded border ${large ? 'min-h-12 px-2' : 'px-1 py-0.5'}`}
          >
            <option value="">{t('places.allBeds')}</option>
            {beds.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
