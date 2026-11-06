import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCurrentSite } from '../org/useSite';
import { BedMap, type BedValue } from '../kpi/BedMap';
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
  const [view, setView] = useState<string>('demand_month');
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

  const values = useMemo<Record<string, BedValue>>(() => {
    const out: Record<string, BedValue> = {};
    if (view.startsWith('stress:')) {
      const o = sat.find((x) => x.code === view.split(':')[1]);
      for (const [bed, v] of Object.entries(o?.beds ?? {}))
        out[bed] = {
          value: null,
          color: STRESS_COLOR[v.stress],
          label: `${t(`kpi.stress.${v.stress}`)} (${v.mean.toFixed(3)})`,
        };
      return out;
    }
    for (const b of water.data?.beds ?? []) {
      const lm2 = b.demand_l_day_by_month[month - 1]! / b.area_m2;
      const v =
        view === 'demand_month'
          ? lm2
          : view === 'demand_year'
            ? b.demand_m3_yr
            : view === 'saving'
              ? b.saving_pct
              : b.kc;
      out[b.bed] = {
        value: v,
        label: [
          `${t('water.v.demandMonth', { month: mname(month) })}: ${lm2.toFixed(2)} L/m²/d`,
          `${t('water.v.demandYear')}: ${nf(b.demand_m3_yr, 1)} m³`,
          `${t('water.v.saving')}: ${b.saving_pct}%`,
          `Kc ${b.kc} · ${b.dominant_life_form}`,
          b.meters ? t('water.metered', { n: b.meters }) : t('water.notMetered'),
        ].join('<br/>'),
      };
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, month, water.data, sat, t, i18n.language]);

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
              <label className="flex items-center gap-2">
                {t('kpi.colourBy')}
                <select
                  value={view}
                  onChange={(e) => setView(e.target.value)}
                  className="min-h-10 rounded border px-2"
                >
                  <option value="demand_month">{t('water.v.demandMonthPick')}</option>
                  <option value="demand_year">{t('water.v.demandYear')}</option>
                  <option value="saving">{t('water.v.saving')}</option>
                  <option value="kc">Kc</option>
                  {sat.map((o) => (
                    <option key={o.code} value={`stress:${o.code}`}>
                      {t('kpi.stressOf', { name: o.name })}
                    </option>
                  ))}
                </select>
              </label>
              {view === 'demand_month' && (
                <label className="flex items-center gap-2">
                  {t('water.month')}
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
              )}
            </div>
          </div>
          {site && (
            <BedMap
              siteId={site.id}
              values={values}
              ramp={RAMPS.blue}
              overlays={overlays.data ?? []}
              legendTitle={
                view.startsWith('stress:')
                  ? t('kpi.stressLegend')
                  : view === 'demand_month'
                    ? `L/m²/d, ${mname(month)}`
                    : view === 'demand_year'
                      ? 'm³/yr'
                      : view === 'saving'
                        ? '%'
                        : 'Kc'
              }
              format={(v) =>
                Number.isInteger(v) || Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)
              }
              testId="water-map"
            />
          )}
          {view.startsWith('stress:') && (
            <p className="text-sm text-gray-700">{t('water.stressHelp')}</p>
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
