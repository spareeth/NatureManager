import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZONE_COLOR, ZONE_ORDER, type RichnessSummary } from './api';

/** Species against plants sampled, per garden and for the whole site: solid where observed
 *  (rarefaction), dashed beyond (extrapolation to twice the sample), a dot at the actual sample. */
export function RichnessCurve({ data }: { data: Record<string, RichnessSummary> }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const keys = [...ZONE_ORDER.filter((z) => data[z]), 'all'];
  const W = 640;
  const H = 260;
  const pad = { l: 40, r: 100, t: 12, b: 40 };
  const maxM = Math.max(...keys.map((k) => data[k]!.curve.at(-1)?.m ?? 0), 1);
  const maxS = Math.max(
    ...keys.map((k) => Math.max(...data[k]!.curve.map((c) => c.s), data[k]!.chao1)),
    1,
  );
  const niceS = Math.ceil(maxS / 20) * 20;
  const x = (m: number) => pad.l + ((W - pad.l - pad.r) * m) / maxM;
  const y = (s: number) => pad.t + (H - pad.t - pad.b) * (1 - s / niceS);
  const name = (k: string) =>
    k === 'all' ? t('bio.rich.all') : t(`zones.${k}`, { defaultValue: k });
  const path = (pts: { m: number; s: number }[]) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.m)},${y(p.s)}`).join('');
  const hoverM = hover;

  return (
    <figure className="max-w-3xl space-y-2" data-testid="richness-curve">
      <figcaption className="font-semibold">{t('bio.rich.title')}</figcaption>
      <div className="flex flex-wrap gap-4 text-sm">
        {keys.map((k) => (
          <span key={k} className="flex items-center gap-2">
            <span
              className="inline-block h-0.5 w-5"
              style={{ background: ZONE_COLOR[k], height: k === 'all' ? 3 : 2 }}
            />
            {name(k)}
          </span>
        ))}
        <span className="text-gray-600">{t('bio.rich.dashed')}</span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t('bio.rich.title')}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const m = ((((e.clientX - r.left) / r.width) * W - pad.l) / (W - pad.l - pad.r)) * maxM;
            setHover(m >= 0 && m <= maxM ? m : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(niceS * f)}
                y2={y(niceS * f)}
                stroke="#e5e7eb"
              />
              <text
                x={pad.l - 6}
                y={y(niceS * f) + 4}
                textAnchor="end"
                fontSize={11}
                fill="#4b5563"
              >
                {Math.round(niceS * f)}
              </text>
              <text x={x(maxM * f)} y={H - 24} textAnchor="middle" fontSize={11} fill="#4b5563">
                {Math.round(maxM * f)}
              </text>
            </g>
          ))}
          <text
            x={(W - pad.r + pad.l) / 2}
            y={H - 4}
            textAnchor="middle"
            fontSize={11}
            fill="#4b5563"
          >
            {t('bio.rich.plants')}
          </text>
          {keys.map((k) => {
            const c = data[k]!.curve;
            const obs = c.filter((p) => !p.extrapolated);
            const ext = c.filter((p) => p.extrapolated);
            const last = c.at(-1)!;
            const w = k === 'all' ? 3 : 2;
            return (
              <g key={k}>
                <path d={path(obs)} fill="none" stroke={ZONE_COLOR[k]} strokeWidth={w} />
                {ext.length > 0 && (
                  <path
                    d={path([obs.at(-1)!, ...ext])}
                    fill="none"
                    stroke={ZONE_COLOR[k]}
                    strokeWidth={w}
                    strokeDasharray="5 4"
                  />
                )}
                <circle
                  cx={x(data[k]!.n)}
                  cy={y(data[k]!.s_obs)}
                  r={4}
                  fill={ZONE_COLOR[k]}
                  stroke="#fff"
                  strokeWidth={2}
                />
                <text x={x(last.m) + 4} y={y(last.s) + 4} fontSize={11} fill="#1f2937">
                  {name(k)}
                </text>
              </g>
            );
          })}
          {hoverM != null && (
            <line
              x1={x(hoverM)}
              x2={x(hoverM)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#9ca3af"
              strokeDasharray="2 2"
            />
          )}
        </svg>
        {hoverM != null && (
          <div
            className="pointer-events-none absolute top-0 start-12 rounded border bg-white p-2 text-xs shadow"
            role="status"
          >
            <p className="font-semibold">
              {Math.round(hoverM)} {t('bio.rich.plants')}
            </p>
            {keys.map((k) => {
              const c = data[k]!.curve;
              const near = c.reduce(
                (a, b) => (Math.abs(b.m - hoverM) < Math.abs(a.m - hoverM) ? b : a),
                c[0]!,
              );
              return (
                <p key={k}>
                  {name(k)}: {near.s.toFixed(1)}
                </p>
              );
            })}
          </div>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm underline">{t('kpi.showTable')}</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr>
              {['group', 'n', 'sObs', 'chao1', 'coverage', 'f1', 'f2'].map((h) => (
                <th key={h} className={h === 'group' ? 'text-start' : 'text-end'}>
                  {t(`bio.rich.col.${h}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k} className="border-t">
                <td>{name(k)}</td>
                <td className="text-end tabular-nums">{data[k]!.n}</td>
                <td className="text-end tabular-nums">{data[k]!.s_obs}</td>
                <td className="text-end tabular-nums">{data[k]!.chao1}</td>
                <td className="text-end tabular-nums">{(data[k]!.coverage * 100).toFixed(1)}%</td>
                <td className="text-end tabular-nums">{data[k]!.singletons}</td>
                <td className="text-end tabular-nums">{data[k]!.doubletons}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
