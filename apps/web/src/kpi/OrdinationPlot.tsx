import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ZONE_COLOR, ZONE_ORDER } from './api';
import { pcoa, type Community } from './ordination';

/** Beds placed by how alike their species are (PCoA of Bray-Curtis): close beds share species. */
export function OrdinationPlot({ community }: { community: Community }) {
  const { t } = useTranslation();
  const o = useMemo(() => pcoa(community), [community]);
  const [hover, setHover] = useState<string | null>(null);
  if (!o) return null;
  const W = 640;
  const H = 380;
  const pad = 30;
  const xs = o.points.map((p) => p.x);
  const ys = o.points.map((p) => p.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const sx = (v: number) => pad + ((W - 2 * pad) * (v - x0)) / (x1 - x0 || 1);
  const sy = (v: number) => H - pad - ((H - 2 * pad) * (v - y0)) / (y1 - y0 || 1);
  const zone = (bed: string) => bed.slice(0, 2);
  const h = o.points.find((p) => p.bed === hover);

  return (
    <figure className="max-w-3xl space-y-2" data-testid="ordination">
      <figcaption className="font-semibold">{t('bio.ord.title')}</figcaption>
      <div className="flex flex-wrap gap-4 text-sm">
        {ZONE_ORDER.map((z) => (
          <span key={z} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: ZONE_COLOR[z] }}
            />
            {t(`zones.${z}`, { defaultValue: z })}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={t('bio.ord.title')}
        >
          <line x1={sx(0)} x2={sx(0)} y1={pad} y2={H - pad} stroke="#e5e7eb" />
          <line x1={pad} x2={W - pad} y1={sy(0)} y2={sy(0)} stroke="#e5e7eb" />
          <text x={W - pad} y={H - 8} textAnchor="end" fontSize={11} fill="#4b5563">
            {t('bio.ord.axis', { n: 1, pct: (o.explained[0] * 100).toFixed(0) })}
          </text>
          <text x={pad} y={14} fontSize={11} fill="#4b5563">
            {t('bio.ord.axis', { n: 2, pct: (o.explained[1] * 100).toFixed(0) })}
          </text>
          {o.points.map((p) => (
            <circle
              key={p.bed}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={hover === p.bed ? 7 : 5}
              fill={ZONE_COLOR[zone(p.bed)] ?? '#6b7280'}
              stroke="#fff"
              strokeWidth={2}
              onMouseEnter={() => setHover(p.bed)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{p.bed}</title>
            </circle>
          ))}
        </svg>
        {h && (
          <div
            className="pointer-events-none absolute top-0 end-0 rounded border bg-white p-2 text-xs shadow"
            role="status"
          >
            <p className="font-semibold">{h.bed}</p>
            <p>{t('bio.ord.species', { n: Object.keys(community[h.bed] ?? {}).length })}</p>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-700">{t('bio.ord.help')}</p>
    </figure>
  );
}
