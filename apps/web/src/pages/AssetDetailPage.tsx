import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchAssetDetail, fetchTimeline, signPhotos } from '../assets/api';
import { attributeRows } from '../assets/attributes';
import { describeEvent } from '../assets/timeline';
import { StatusBadge } from '../assets/StatusBadge';
import { AssetMiniMap } from '../assets/AssetMiniMap';
import { formatGrid, formatLatLon } from '../map/format';
import { useOrg } from '../org/context';
import { canEditAssets } from '../auth/canEdit';
import { useTypeName } from '../assets/useTypeNames';
import { LabelDialog } from '../labels/LabelDialog';
import { assetUrl } from '../labels/qrPayload';
import { RequestForm } from '../work/RequestForm';
import { useNavigate } from 'react-router-dom';

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2 border-b py-1.5 text-sm">
      <dt className="text-gray-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const typeName = useTypeName();
  const [printing, setPrinting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const navigate = useNavigate();
  const asset = useQuery({
    queryKey: ['asset', id],
    enabled: !!id,
    queryFn: () => fetchAssetDetail(id!),
  });
  const timeline = useQuery({
    queryKey: ['asset-timeline', id],
    enabled: !!id,
    queryFn: () => fetchTimeline(id!),
  });

  const photos = useMemo(
    () =>
      (timeline.data ?? [])
        .filter((e) => e.kind === 'photo')
        .map((e) => ({
          bucket: String(e.data.bucket),
          path: String(e.data.path),
          caption: e.data.caption as string | null,
          at: e.at,
        })),
    [timeline.data],
  );
  const signed = useQuery({
    queryKey: ['photo-urls', photos.map((p) => `${p.bucket}/${p.path}`)],
    enabled: photos.length > 0,
    queryFn: () => signPhotos(photos),
  });

  if (asset.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (asset.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {asset.error.message}
      </p>
    );
  const a = asset.data;
  if (!a) {
    return (
      <section className="p-4">
        <p>{t('assets.notFound')}</p>
        <Link to="/assets" className="underline">
          {t('assets.back')}
        </Link>
      </section>
    );
  }

  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  const attrs = attributeRows(a.attributes, a.type.attribute_schema, i18n.language);
  const common =
    a.taxon?.common_names?.[i18n.language === 'ar' ? 'ar' : 'en']?.join(', ') ??
    a.taxon?.common_names?.en?.join(', ');

  return (
    <section className="mx-auto max-w-6xl p-4">
      <Link to="/assets" className="text-sm underline">
        {t('assets.back')}
      </Link>
      {printing && <LabelDialog ids={[a.id]} count={1} onClose={() => setPrinting(false)} />}
      {reporting && current && (
        <div className="mb-3 mt-2 max-w-lg">
          <RequestForm
            orgId={current.organisationId}
            siteId={a.site_id}
            asset={{
              id: a.id,
              tag_code: a.tag_code,
              location_id: a.location?.id ?? null,
              lon: a.lon,
              lat: a.lat,
            }}
            onCancel={() => setReporting(false)}
            onDone={(wo) => navigate(`/work/${wo.id}`)}
          />
        </div>
      )}
      <header className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="font-mono text-2xl font-semibold" dir="ltr">
          {a.tag_code}
        </h1>
        <StatusBadge status={a.status} />
        <span className="text-gray-600">
          {typeName(a.type.code, a.type.name)}
          {a.taxon && (
            <>
              {' · '}
              <i>{a.taxon.scientific_name}</i>
              {common ? ` (${common})` : ''}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => setPrinting(true)}
          className="ms-auto rounded border px-3 py-1 text-sm"
        >
          {t('labels.printOne')}
        </button>
        <button
          type="button"
          onClick={() => setReporting(true)}
          className="rounded border px-3 py-1 text-sm"
        >
          {t('wo.report')}
        </button>
        {current && canEditAssets(current.roles) && (
          <span className="flex gap-3 text-sm">
            <Link
              to={`/assets/${a.id}/edit`}
              className="rounded bg-green-800 px-3 py-1 font-medium text-white"
            >
              {t('edit.edit')}
            </Link>
            <Link
              to={`/?shift=${a.id}`}
              className="rounded border border-green-800 px-3 py-1 text-green-900"
            >
              {t('edit.moveByOffsetLink')}
            </Link>
            {/* Clicking a new spot sets a point, so it is offered for point assets only. */}
            {a.geometry.type === 'Point' && (
              <Link
                to={`/?move=${a.id}`}
                className="rounded border border-green-800 px-3 py-1 text-green-900"
              >
                {t('edit.moveOnMap')}
              </Link>
            )}
          </span>
        )}
      </header>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-1 font-semibold">{t('assets.details')}</h2>
          <dl>
            <Row label={t('assets.f.name')}>{a.name}</Row>
            <Row label={t('assets.f.class')}>{t(`assets.${a.type.asset_class}`)}</Row>
            <Row label={t('assets.f.taxon')}>
              {a.taxon && (
                <>
                  <i>{a.taxon.scientific_name}</i> {a.taxon.authorship}
                  {a.taxon.family && <span className="text-gray-500"> · {a.taxon.family}</span>}
                </>
              )}
            </Row>
            <Row label={t('assets.f.inhouse')}>{a.taxon?.inhouse_code}</Row>
            <Row label={t('assets.f.iucn')}>
              {a.taxon?.iucn_category ? t(`iucn.${a.taxon.iucn_category}`) : ''}
            </Row>
            <Row label={t('assets.f.accession')}>
              {a.accession &&
                [
                  a.accession.accession_number,
                  a.accession.provenance_type && t(`provenance.${a.accession.provenance_type}`),
                  a.accession.received_date,
                ]
                  .filter(Boolean)
                  .join(' · ')}
            </Row>
            <Row label={t('assets.f.condition')}>
              {a.condition != null ? `${a.condition} / 5` : ''}
            </Row>
            <Row label={t('assets.f.criticality')}>
              {a.criticality != null ? `${a.criticality} / 5` : ''}
            </Row>
            <Row label={t('assets.f.installed')}>{a.install_date}</Row>
            <Row label={t('assets.f.plantCount')}>{a.plant_count}</Row>
            <Row label={t('assets.f.barcode')}>{a.barcode}</Row>
            <Row label={t('assets.f.parent')}>
              {a.parent && (
                <Link to={`/assets/${a.parent.id}`} className="font-mono underline" dir="ltr">
                  {a.parent.tag_code}
                </Link>
              )}
            </Row>
            <Row label={t('assets.f.children')}>
              {a.children.length > 0 &&
                a.children.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 && ', '}
                    <Link to={`/assets/${c.id}`} className="font-mono underline" dir="ltr">
                      {c.tag_code}
                    </Link>
                  </span>
                ))}
            </Row>
            <Row label={t('assets.f.hortis')}>{a.legacy_hortis_id}</Row>
            {attrs.map((r) => (
              <Row key={r.key} label={r.label}>
                {r.value}
              </Row>
            ))}
          </dl>
        </div>

        <div>
          <h2 className="mb-1 font-semibold">{t('assets.position')}</h2>
          <dl>
            <Row label={t('assets.f.location')}>
              {a.location && (
                <>
                  <span className="font-mono" dir="ltr">
                    {a.location.code}
                  </span>
                  {a.location.zone_code !== a.location.code && (
                    <span className="text-gray-600">
                      {' '}
                      ·{' '}
                      {t(`map.zones.${a.location.zone_code}`, {
                        defaultValue: a.location.zone_name,
                      })}
                    </span>
                  )}
                </>
              )}
            </Row>
            <Row label={t('assets.f.latlon')}>
              <span className="font-mono text-xs" dir="ltr">
                {formatLatLon(a.lat, a.lon)}
              </span>
            </Row>
            <Row label={t('assets.f.grid')}>
              {a.local_x != null && a.local_y != null && (
                <span className="font-mono text-xs" dir="ltr">
                  {formatGrid(Number(a.local_x), Number(a.local_y))}
                </span>
              )}
            </Row>
            <Row label={t('assets.f.qr')}>
              <a href={assetUrl(a.tag_code)} className="font-mono text-xs underline" dir="ltr">
                {assetUrl(a.tag_code)}
              </a>
            </Row>
            <Row label={t('assets.f.source')}>
              {a.position_source &&
                `${t(`position.${a.position_source}`)}${a.position_accuracy_m != null ? ` · ±${a.position_accuracy_m} m` : ''}`}
            </Row>
          </dl>
          <div className="mt-3">
            <AssetMiniMap geometry={a.geometry} lat={a.lat} lon={a.lon} status={a.status} />
          </div>
        </div>
      </div>

      {photos.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">{t('assets.photos')}</h2>
          <ul className="flex flex-wrap gap-3">
            {photos.map((p) => {
              const url = signed.data?.[`${p.bucket}/${p.path}`];
              return (
                <li key={p.path} className="w-40">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={p.caption ?? a.tag_code}
                        className="h-28 w-40 rounded border object-cover"
                      />
                    </a>
                  ) : (
                    <div className="flex h-28 w-40 items-center justify-center rounded border bg-gray-50 text-xs text-gray-500">
                      {t('common.loading')}
                    </div>
                  )}
                  <p className="mt-1 text-xs text-gray-600">{p.caption ?? when(p.at)}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 font-semibold">{t('assets.timeline')}</h2>
        {timeline.error && (
          <p role="alert" className="text-red-700">
            {timeline.error.message}
          </p>
        )}
        <ol className="border-s-2 border-green-800/30 ps-4" data-testid="timeline">
          {(timeline.data ?? []).map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`} className="relative mb-3 text-sm">
              <span
                aria-hidden
                className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-green-800"
              />
              <p>{describeEvent(e, t)}</p>
              <p className="text-xs text-gray-500">
                {when(e.at)}
                {e.by ? ` · ${e.by}` : ''}
              </p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-gray-500">{t('assets.timelineLater')}</p>
      </section>
    </section>
  );
}
