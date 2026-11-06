import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { BedMap, type BedValue, type IndicatorLayer } from '../kpi/BedMap';
import { ParamsPanel } from '../kpi/ParamsPanel';
import { KpiTile } from '../kpi/KpiTile';
import { RichnessCurve } from '../kpi/RichnessCurve';
import { OrdinationPlot } from '../kpi/OrdinationPlot';
import {
  fetchAnalytics,
  fetchBio,
  fetchCommunity,
  fetchHistory,
  fetchOverlays,
  RAMPS,
  STRESS_COLOR,
  takeSnapshot,
  type BioBed,
} from '../kpi/api';

type Metric = keyof Pick<
  BioBed,
  | 's'
  | 'n'
  | 'shannon'
  | 'evenness'
  | 'hill_q1'
  | 'species_density_ha'
  | 'pct_native_species'
  | 'mean_sorensen'
>;
const METRICS: Metric[] = [
  's',
  'shannon',
  'evenness',
  'hill_q1',
  'n',
  'species_density_ha',
  'pct_native_species',
  'mean_sorensen',
];

const GLOSSARY = [
  's',
  'n',
  'shannon',
  'simpson',
  'evenness',
  'margalef',
  'hill',
  'density',
  'native',
  'threatened',
  'beta',
  'turnover',
  'chao1',
  'coverage',
  'curve',
  'ordination',
  'moran',
  'carbon',
  'ndvi',
  'greenness',
  'stress',
  'change',
] as const;

/** Biodiversity baseline and monitoring (KPI reporting): kit script 02 on the live plant records,
 *  and vegetation from the satellite layers. */
export function BiodiversityPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const qc = useQueryClient();
  const bio = useQuery({
    queryKey: ['kpi', 'bio', site?.id],
    queryFn: () => fetchBio(site!.id),
    enabled: !!site,
  });
  const overlays = useQuery({
    queryKey: ['kpi', 'overlays', site?.id, 'biodiversity'],
    queryFn: () => fetchOverlays(site!.id, 'biodiversity'),
    enabled: !!site,
  });
  const analytics = useQuery({
    queryKey: ['kpi', 'bio-analytics', site?.id],
    queryFn: () => fetchAnalytics(site!.id),
    enabled: !!site,
  });
  const community = useQuery({
    queryKey: ['kpi', 'community', site?.id],
    queryFn: () => fetchCommunity(site!.id),
    enabled: !!site,
  });
  const history = useQuery({
    queryKey: ['kpi', 'history', site?.id, 'biodiversity'],
    queryFn: () => fetchHistory(site!.id, 'biodiversity'),
    enabled: !!site,
  });
  const snap = useMutation({
    mutationFn: () => takeSnapshot(site!.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kpi', 'history'] }),
  });
  const isManager = !!current?.roles.includes('manager');
  const sat = (overlays.data ?? []).filter((o) => o.kind === 'ndvi' || o.kind === 'greenness');

  // Indicator layers for the map: diversity per bed, carbon, satellite values and their stress classes.
  const layers = useMemo<IndicatorLayer[]>(() => {
    const out: IndicatorLayer[] = [];
    const div = t('bio.diversity');
    for (const m of METRICS) {
      const values: Record<string, BedValue> = {};
      for (const b of bio.data?.beds ?? []) {
        const v = b[m];
        values[b.bed] = {
          value: v == null ? null : Number(v),
          label: `${t(`bio.m.${m}`)}: ${v ?? t('kpi.noData')}`,
        };
      }
      out.push({ key: m, group: div, label: t(`bio.m.${m}`), help: t(`bio.help.${m}`), values });
    }
    const carbon: Record<string, BedValue> = {};
    for (const c of analytics.data?.carbon.beds ?? [])
      carbon[c.bed] = {
        value: c.carbon_t_ha,
        label: `${t('bio.carbon.perHa')}: ${c.carbon_t_ha} t C/ha (${c.carbon_t} ± ${c.carbon_ci95_t} t C)`,
      };
    out.push({
      key: 'carbon_t_ha',
      group: div,
      label: t('bio.carbon.perHa'),
      help: t('bio.help.carbon_t_ha'),
      values: carbon,
    });
    const satG = t('kpi.satellite');
    for (const o of sat) {
      const mean: Record<string, BedValue> = {};
      const stress: Record<string, BedValue> = {};
      for (const [bed, v] of Object.entries(o.beds)) {
        mean[bed] = { value: v.mean, label: `${o.name}: ${v.mean.toFixed(3)}` };
        stress[bed] = {
          value: null,
          color: STRESS_COLOR[v.stress],
          label: `${t('kpi.stressOf', { name: o.name })}: ${t(`kpi.stress.${v.stress}`)}`,
        };
      }
      out.push({
        key: `sat:${o.code}`,
        group: satG,
        label: o.name,
        help: t('bio.help.sat'),
        values: mean,
      });
      out.push({
        key: `stress:${o.code}`,
        group: satG,
        label: t('kpi.stressOf', { name: o.name }),
        help: t('kpi.stressHelpShort'),
        values: stress,
        classes: (['none', 'moderate', 'high'] as const).map((k) => ({
          color: STRESS_COLOR[k],
          label: t(`kpi.stress.${k}`),
        })),
      });
    }
    return out;
  }, [bio.data, analytics.data, sat, t]);

  const g = bio.data?.garden;
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('bio.heading')}</h1>
            <p className="text-sm text-gray-700">{t('bio.intro')}</p>
          </div>
          {isManager && (
            <button
              type="button"
              onClick={() => snap.mutate()}
              disabled={snap.isPending}
              className="min-h-10 rounded border px-3 text-sm"
            >
              {t('kpi.snapshot')}
            </button>
          )}
        </header>
        {bio.isError && <p role="alert">{(bio.error as Error).message}</p>}
        {g && (
          <section
            className="grid grid-cols-2 gap-3 md:grid-cols-4"
            aria-label={t('kpi.headline')}
            data-testid="bio-tiles"
          >
            <KpiTile
              label={t('bio.t.gamma')}
              value={g.gamma_s}
              sub={t('bio.t.gammaSub', { plants: g.plants })}
            />
            <KpiTile
              label={t('bio.t.meanS')}
              value={`${g.mean_s} ± ${g.sd_s}`}
              sub={t('bio.t.meanSSub', { beds: g.beds_with_plants })}
            />
            <KpiTile
              label={t('bio.t.shannon')}
              value={g.shannon}
              sub={t('bio.t.shannonSub', { mean: g.mean_shannon })}
            />
            <KpiTile
              label={t('bio.t.evenness')}
              value={g.mean_evenness}
              sub={t('bio.t.evennessSub')}
            />
            <KpiTile
              label={t('bio.t.native')}
              value={`${g.pct_native_species}%`}
              sub={t('bio.t.nativeSub', { n: g.native_species, plants: g.pct_native_plants })}
              warn={t('bio.t.nativeWarn')}
            />
            <KpiTile
              label={t('bio.t.threatened')}
              value={g.threatened_species}
              sub={t('bio.t.threatenedSub')}
            />
            <KpiTile label={t('bio.t.beta')} value={g.mean_sorensen} sub={t('bio.t.betaSub')} />
            <KpiTile
              label={t('kpi.lastSnapshot')}
              value={
                history.data?.length
                  ? history.data[history.data.length - 1]!.taken_on
                  : t('kpi.none')
              }
              sub={t('kpi.snapshotSub', { n: history.data?.length ?? 0 })}
            />
          </section>
        )}

        <section className="space-y-2" aria-labelledby="bio-map-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="bio-map-h" className="text-lg font-semibold">
              {t('bio.mapTitle')}
            </h2>
          </div>
          {site && (
            <BedMap
              siteId={site.id}
              layers={layers}
              overlays={overlays.data ?? []}
              defaultOn={['s']}
              fillRamp={RAMPS.green}
              testId="bio-map"
            />
          )}
        </section>

        {analytics.data && (
          <section className="space-y-3" aria-labelledby="bio-rich-h">
            <h2 id="bio-rich-h" className="text-lg font-semibold">
              {t('bio.rich.heading')}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <KpiTile
                label={t('bio.rich.observed')}
                value={analytics.data.richness.all?.s_obs ?? 0}
              />
              <KpiTile
                label={t('bio.rich.chao1')}
                value={analytics.data.richness.all?.chao1 ?? 0}
                sub={t('bio.rich.chao1Sub')}
              />
              <KpiTile
                label={t('bio.rich.coverage')}
                value={`${((analytics.data.richness.all?.coverage ?? 0) * 100).toFixed(1)}%`}
                sub={t('bio.rich.coverageSub')}
              />
              <KpiTile
                label={t('bio.rich.singletons')}
                value={analytics.data.richness.all?.singletons ?? 0}
                sub={t('bio.rich.singletonsSub')}
              />
            </div>
            <RichnessCurve data={analytics.data.richness} />
          </section>
        )}

        {community.data && (
          <section aria-label={t('bio.ord.title')}>
            <OrdinationPlot community={community.data} />
          </section>
        )}

        {analytics.data && (
          <section className="space-y-3" aria-labelledby="bio-moran-h">
            <h2 id="bio-moran-h" className="text-lg font-semibold">
              {t('bio.moran.heading')}
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="moran">
              {(['richness', 'shannon'] as const).map((k) => {
                const m = analytics.data.moran[k];
                return (
                  <KpiTile
                    key={k}
                    label={t(`bio.moran.${k}`)}
                    value={m.i == null ? t('kpi.noData') : `I = ${m.i}`}
                    sub={
                      m.p == null
                        ? undefined
                        : `p = ${m.p} · ${t(m.p < 0.05 ? 'bio.moran.clustered' : 'bio.moran.noPattern')}`
                    }
                    warn={t('bio.moran.few', { n: m.with_neighbours, beds: m.beds })}
                  />
                );
              })}
            </div>
            <p className="text-sm text-gray-700">{t('bio.moran.help')}</p>
          </section>
        )}

        {analytics.data?.carbon.totals.all && (
          <section className="space-y-3" aria-labelledby="bio-carbon-h">
            <h2 id="bio-carbon-h" className="text-lg font-semibold">
              {t('bio.carbon.heading')}
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="carbon">
              <KpiTile
                label={t('bio.carbon.stock')}
                value={`${analytics.data.carbon.totals.all.carbon_t} ± ${analytics.data.carbon.totals.all.carbon_ci95_t} t`}
                sub={t('bio.carbon.stockSub')}
                warn={t('bio.carbon.warn')}
              />
              <KpiTile
                label={t('bio.carbon.co2e')}
                value={`${analytics.data.carbon.totals.all.co2e_t} t`}
                sub="CO₂e = C × 44/12"
              />
              <KpiTile
                label={t('bio.carbon.biomass')}
                value={`${analytics.data.carbon.totals.all.biomass_t} t`}
                sub={t('bio.carbon.biomassSub')}
              />
              <KpiTile
                label={t('bio.carbon.perHa')}
                value={`${analytics.data.carbon.totals.all.carbon_t_ha} t C/ha`}
                sub={t('bio.carbon.perHaSub')}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-start">{t('bio.col.zone')}</th>
                    <th className="text-end">{t('bio.carbon.biomass')} (t)</th>
                    <th className="text-end">{t('bio.carbon.stock')} (t C)</th>
                    <th className="text-end">CO₂e (t)</th>
                    <th className="text-end">t C/ha</th>
                  </tr>
                </thead>
                <tbody>
                  {['EG', 'NG', 'SG', 'WG', 'all']
                    .filter((z) => analytics.data.carbon.totals[z])
                    .map((z) => {
                      const c = analytics.data.carbon.totals[z]!;
                      return (
                        <tr key={z} className="border-t">
                          <td>
                            {z === 'all' ? t('bio.rich.all') : t(`zones.${z}`, { defaultValue: z })}
                          </td>
                          <td className="text-end tabular-nums">{c.biomass_t}</td>
                          <td className="text-end tabular-nums">
                            {c.carbon_t} ± {c.carbon_ci95_t}
                          </td>
                          <td className="text-end tabular-nums">{c.co2e_t}</td>
                          <td className="text-end tabular-nums">{c.carbon_t_ha}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {bio.data && (
          <section className="space-y-2" aria-labelledby="bio-zones-h">
            <h2 id="bio-zones-h" className="text-lg font-semibold">
              {t('bio.zones')}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['zone', 'beds', 'gamma', 'plants', 'meanS', 'meanH', 'meanJ'].map((h) => (
                      <th key={h} className={h === 'zone' ? 'text-start' : 'text-end'}>
                        {t(`bio.col.${h}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bio.data.zones.map((z) => (
                    <tr key={z.zone} className="border-t">
                      <td>{t(`zones.${z.zone}`, { defaultValue: z.zone })}</td>
                      <td className="text-end tabular-nums">{z.n_beds}</td>
                      <td className="text-end tabular-nums">{z.gamma_s}</td>
                      <td className="text-end tabular-nums">{z.total_n}</td>
                      <td className="text-end tabular-nums">
                        {z.mean_s} ± {z.sd_s ?? 0}
                      </td>
                      <td className="text-end tabular-nums">{z.mean_h}</td>
                      <td className="text-end tabular-nums">{z.mean_j}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {bio.data && (
          <details className="space-y-2">
            <summary className="cursor-pointer text-lg font-semibold">{t('bio.beds')}</summary>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="bio-beds">
                <thead>
                  <tr>
                    <th className="text-start">{t('bio.col.bed')}</th>
                    {(
                      [
                        's',
                        'n',
                        'shannon',
                        'simpson',
                        'evenness',
                        'margalef',
                        'hill_q1',
                        'hill_q2',
                        'species_density_ha',
                        'pct_native_species',
                        'mean_bray',
                        'mean_sorensen',
                        'mean_turnover',
                      ] as const
                    ).map((k) => (
                      <th key={k} className="text-end">
                        {t(`bio.m.${k}`)}
                      </th>
                    ))}
                    {sat.map((o) => (
                      <th key={o.code} className="text-end">
                        {o.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bio.data.beds.map((b) => (
                    <tr key={b.bed} className="border-t">
                      <td>{b.bed}</td>
                      {(
                        [
                          's',
                          'n',
                          'shannon',
                          'simpson',
                          'evenness',
                          'margalef',
                          'hill_q1',
                          'hill_q2',
                          'species_density_ha',
                          'pct_native_species',
                          'mean_bray',
                          'mean_sorensen',
                          'mean_turnover',
                        ] as const
                      ).map((k) => (
                        <td key={k} className="text-end tabular-nums">
                          {b[k] ?? ''}
                        </td>
                      ))}
                      {sat.map((o) => (
                        <td key={o.code} className="text-end tabular-nums">
                          {o.beds[b.bed]?.mean.toFixed(3) ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}

        <section className="space-y-2" aria-labelledby="bio-gloss-h" data-testid="glossary">
          <h2 id="bio-gloss-h" className="text-lg font-semibold">
            {t('bio.gloss.heading')}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
            {GLOSSARY.map((k) => (
              <div key={k}>
                <dt className="font-semibold">{t(`bio.gloss.${k}.term`)}</dt>
                <dd className="text-gray-700">{t(`bio.gloss.${k}.text`)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="space-y-1 text-sm text-gray-700" aria-labelledby="bio-method-h">
          <h2 id="bio-method-h" className="text-lg font-semibold text-gray-900">
            {t('kpi.method')}
          </h2>
          <p>{t('bio.method')}</p>
          <p>{t('bio.methodMore')}</p>
        </section>
        {bio.data && 'parameters' in bio.data && (
          <ParamsPanel
            params={(bio.data as unknown as { parameters: Record<string, never> }).parameters}
            module="biodiversity"
          />
        )}
      </div>
    </div>
  );
}
