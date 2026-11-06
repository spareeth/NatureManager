import { useState } from 'react';
import { useTranslation } from 'react-i18next';

const DEMAND = '#2a78b5';
const FLAT = '#c9a227';

/** Daily garden water use per month: FAO-56 demand against the flat rate (grouped bars, one axis,
 *  hover tooltip, legend, and the same numbers as a table below). */
export function MonthlyChart({
  months,
}: {
  months: { month: number; eto: number; demand_m3_day: number; current_m3_day: number }[];
}) {
  const { t, i18n } = useTranslation();
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 8, t: 12, b: 26 };
  const max = Math.max(...months.flatMap((m) => [m.demand_m3_day, m.current_m3_day]), 1);
  const nice = Math.ceil(max / 10) * 10;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const band = (W - pad.l - pad.r) / 12;
  const bw = Math.max(4, band / 2 - 4);
  const name = (m: number) =>
    new Date(2026, m - 1, 1).toLocaleString(i18n.language, { month: 'short' });
  const ticks = [0, nice / 4, nice / 2, (3 * nice) / 4, nice];
  const h = hover != null ? months.find((m) => m.month === hover) : null;

  return (
    <figure className="space-y-2" data-testid="monthly-chart">
      <figcaption className="font-semibold">{t('water.chart.title')}</figcaption>
      <div className="flex flex-wrap gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: DEMAND }} />
          {t('water.chart.demand')}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm" style={{ background: FLAT }} />
          {t('water.chart.flat')}
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t('water.chart.title')}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(v)}
                y2={y(v)}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#4b5563">
                {Math.round(v)}
              </text>
            </g>
          ))}
          <text x={4} y={pad.t + 2} fontSize={11} fill="#4b5563">
            m³/d
          </text>
          {months.map((m, i) => {
            const x0 = pad.l + i * band + band / 2 - bw - 1;
            return (
              <g
                key={m.month}
                onMouseEnter={() => setHover(m.month)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={pad.l + i * band}
                  y={pad.t}
                  width={band}
                  height={H - pad.t - pad.b}
                  fill={hover === m.month ? '#f3f4f6' : 'transparent'}
                />
                <rect
                  x={x0}
                  y={y(m.demand_m3_day)}
                  width={bw}
                  height={y(0) - y(m.demand_m3_day)}
                  rx={2}
                  fill={DEMAND}
                />
                <rect
                  x={x0 + bw + 2}
                  y={y(m.current_m3_day)}
                  width={bw}
                  height={y(0) - y(m.current_m3_day)}
                  rx={2}
                  fill={FLAT}
                />
                <text
                  x={pad.l + i * band + band / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#4b5563"
                >
                  {name(m.month)}
                </text>
              </g>
            );
          })}
          <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#9ca3af" strokeWidth={1} />
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 end-0 rounded border bg-white p-2 text-xs shadow"
            role="status"
          >
            <p className="font-semibold">{name(h.month)}</p>
            <p>ET₀ {h.eto} mm/d</p>
            <p>
              {t('water.chart.demand')}: {h.demand_m3_day} m³/d
            </p>
            <p>
              {t('water.chart.flat')}: {h.current_m3_day} m³/d
            </p>
          </div>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm underline">{t('kpi.showTable')}</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-start">
              <th className="text-start">{t('water.month')}</th>
              <th className="text-end">ET₀ (mm/d)</th>
              <th className="text-end">{t('water.chart.demand')} (m³/d)</th>
              <th className="text-end">{t('water.chart.flat')} (m³/d)</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t">
                <td>{name(m.month)}</td>
                <td className="text-end tabular-nums">{m.eto}</td>
                <td className="text-end tabular-nums">{m.demand_m3_day}</td>
                <td className="text-end tabular-nums">{m.current_m3_day}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
