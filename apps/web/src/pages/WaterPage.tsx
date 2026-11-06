import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentSite } from '../org/useSite';
import { BedMap, type BedValue, type IndicatorLayer } from '../kpi/BedMap';
import { MonthlyChart } from '../kpi/MonthlyChart';
import { ParamsPanel } from '../kpi/ParamsPanel';
import { KpiTile } from '../kpi/KpiTile';
import { fetchOverlays, fetchWater, RAMPS, STRESS_COLOR } from '../kpi/api';

const nf = (v: number, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d });

/** Water requirement (KPI reporting): FAO-56 demand per bed against the flat rate (kit script 06),
 *  a satellite proxy of water stress, and metered use once flow meters report. */
export function WaterPage() {
  const { t, i18n } = useTranslation();
  const { site } = useCurrentSite();
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const water = useQuery({
    queryKey: ['kpi', 'water', site?.id],
    queryFn: () => fetchWater(site!.id),
    enabled: !!site,
  });
  const overlays = useQuery({
    queryKey: ['kpi', 'overlays', site?.id, 'water'],
    queryFn: () => fetchOverlays(site!.id, 'water'),
    enabled: !!site,
  });
  const sat = (overlays.data ?? []).filter((o) => o.kind === 'ndvi' || o.kind === 'greenness');
  const mname = (m: number) =>
    new Date(2026, m - 1, 1).toLocaleString(i18n.language, { month: 'long' });

  // Indicator layers: water demand per bed (FAO-56), saving, Kc, and the satellite stress classes.
  const layers = useMemo<IndicatorLayer[]>(() => {
    const beds = water.data?.beds ?? [];
    const g1 = t('water.layers');
    const make = (
      key: string,
      label: string,
      help: string,
      get: (b: (typeof beds)[number]) => number,
      unit: string,
    ) => {
      const values: Record<string, BedValue> = {};
      for (const b of beds) {
        const v = get(b);
        values[b.bed] = { value: v, label: `${label}: ${v.toFixed(2)} ${unit}` };
      }
      return { key, group: g1, label, help, values } as IndicatorLayer;
    };
    const out: IndicatorLayer[] = [
      make(
        'demand_month',
        t('water.v.demandMonth', { month: mname(month) }),
        t('water.help.demand_month'),
        (b) => b.demand_l_day_by_month[month - 1]! / b.area_m2,
        'L/m²/d',
      ),
      make(
        'demand_year',
        t('water.v.demandYear'),
        t('water.help.demand_year'),
        (b) => b.demand_m3_yr,
        'm³',
      ),
      make('saving', t('water.v.saving'), t('water.help.saving'), (b) => b.saving_pct, '%'),
      make('kc', 'Kc', t('water.help.kc'), (b) => b.kc, ''),
      make(
        'months_under',
        t('water.col.under'),
        t('water.help.months_under'),
        (b) => b.months_under,
        '',
      ),
    ];
    const satG = t('kpi.satellite');
    for (const o of sat) {
      const stress: Record<string, BedValue> = {};
      for (const [bed, v] of Object.entries(o.beds))
        stress[bed] = {
          value: null,
          color: STRESS_COLOR[v.stress],
          label: `${t('kpi.stressOf', { name: o.name })}: ${t(`kpi.stress.${v.stress}`)}`,
        };
      out.push({
        key: `stress:${o.code}`,
        group: satG,
        label: t('kpi.stressOf', { name: o.name }),
        help: t('water.stressHelp'),
        values: stress,
        classes: (['none', 'moderate', 'high'] as const).map((k) => ({
          color: STRESS_COLOR[k],
          label: t(`kpi.stress.${k}`),
        })),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, water.data, sat, t, i18n.language]);

  const g = water.data?.garden;
  const flat = water.data?.parameters['water.flat_rate_l_m2_day']?.value as number | undefined;
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <header>
          <h1 className="text-2xl font-semibold">{t('water.heading')}</h1>
          <p className="text-sm text-gray-700">{t('water.intro')}</p>
        </header>
        {water.isError && <p role="alert">{(water.error as Error).message}</p>}
        {g && (
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="water-tiles">
            <KpiTile
              label={t('water.t.demand')}
              value={`${nf(g.demand_m3_yr)} m³`}
              sub={t('water.t.demandSub', { area: nf(g.area_m2), kc: g.mean_kc })}
            />
            <KpiTile
              label={t('water.t.current')}
              value={`${nf(g.current_m3_yr)} m³`}
              sub={t('water.t.currentSub', { rate: flat })}
            />
            <KpiTile
              label={t('water.t.saving')}
              value={`${g.saving_pct}%`}
              sub={t('water.t.savingSub', { m3: nf(g.saving_m3_yr), aed: nf(g.saving_aed_yr) })}
            />
            <KpiTile
              label={t('water.t.under')}
              value={`${g.beds_under} / ${g.beds}`}
              sub={t('water.t.underSub')}
            />
            <KpiTile
              label={t('water.t.metered')}
              value={`${g.metered_beds} / ${g.beds}`}
              sub={t('water.t.meteredSub')}
              warn={g.metered_beds === 0 ? t('water.t.noMeters') : undefined}
            />
          </section>
        )}

        <section className="space-y-2" aria-labelledby="water-map-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="water-map-h" className="text-lg font-semibold">
              {t('water.mapTitle')}
            </h2>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {
                <label className="flex items-center gap-2">
                  {t('water.monthPick')}
                  <select
                    value={month}
                    onChange={(e) => setMonth(Number(e.target.value))}
                    className="min-h-10 rounded border px-2"
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {mname(i + 1)}
                      </option>
                    ))}
                  </select>
                </label>
              }
            </div>
          </div>
          {site && (
            <BedMap
              siteId={site.id}
              layers={layers}
              overlays={overlays.data ?? []}
              defaultOn={['demand_month']}
              fillRamp={RAMPS.blue}
              testId="water-map"
            />
          )}
        </section>

        {water.data && <MonthlyChart months={water.data.months} />}

        {water.data && (
          <details>
            <summary className="cursor-pointer text-lg font-semibold">{t('water.beds')}</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="water-beds">
                <thead>
                  <tr>
                    {[
                      'bed',
                      'area',
                      'kc',
                      'lifeForm',
                      'demand',
                      'current',
                      'saving',
                      'under',
                      'peak',
                      'metered',
                    ].map((h) => (
                      <th
                        key={h}
                        className={
                          h === 'bed' || h === 'lifeForm' || h === 'metered'
                            ? 'text-start'
                            : 'text-end'
                        }
                      >
                        {t(`water.col.${h}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {water.data.beds.map((b) => (
                    <tr key={b.bed} className="border-t">
                      <td>{b.bed}</td>
                      <td className="text-end tabular-nums">{nf(b.area_m2)}</td>
                      <td className="text-end tabular-nums">{b.kc}</td>
                      <td>{b.dominant_life_form}</td>
                      <td className="text-end tabular-nums">{nf(b.demand_m3_yr, 1)}</td>
                      <td className="text-end tabular-nums">{nf(b.current_m3_yr, 1)}</td>
                      <td className="text-end tabular-nums">{b.saving_pct}%</td>
                      <td className="text-end tabular-nums">{b.months_under}</td>
                      <td className="text-end">{mname(b.peak_month)}</td>
                      <td>
                        {b.meters ? t('water.metered', { n: b.meters }) : t('water.notMetered')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <section className="space-y-1 text-sm text-gray-700" aria-labelledby="water-method-h">
          <h2 id="water-method-h" className="text-lg font-semibold text-gray-900">
            {t('kpi.method')}
          </h2>
          <p>{t('water.method')}</p>
          <p>{t('water.meters')}</p>
        </section>
        {water.data && <ParamsPanel params={water.data.parameters} module="water" />}
      </div>
    </div>
  );
}
