import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { fetchTaxon, fetchTaxonHistory, updateOrgTaxon } from '../taxa/api';
import { CuratorForm } from '../taxa/CuratorForm';

function Row({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-2 border-b py-1.5 text-sm">
      <dt className="text-gray-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const show = (v: unknown): string => {
  if (v == null || v === '') return '∅';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k}: ${show(x)}`)
      .join('; ');
  return String(v);
};

export function TaxonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const orgId = current?.organisationId;
  const taxon = useQuery({
    queryKey: ['taxon', orgId, id],
    enabled: !!orgId && !!id,
    queryFn: () => fetchTaxon(orgId!, id!),
  });
  const isCurator = !!current?.roles.includes('curator');
  const canSeeHistory = !!current?.roles.some(
    (r) => r === 'curator' || r === 'manager' || r === 'owner',
  );
  const history = useQuery({
    queryKey: ['taxon-history', orgId, id],
    enabled: !!orgId && !!id && canSeeHistory,
    queryFn: () => fetchTaxonHistory(orgId!, id!),
  });

  if (taxon.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (taxon.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {taxon.error.message}
      </p>
    );
  const x = taxon.data;
  if (!x || !orgId) return <p className="p-4">{t('taxa.notFound')}</p>;

  const refresh = async () => {
    setEditing(false);
    await queryClient.invalidateQueries({ queryKey: ['taxon'] });
    await queryClient.invalidateQueries({ queryKey: ['taxon-history'] });
    await queryClient.invalidateQueries({ queryKey: ['taxa'] });
  };
  const proposed = x.org.attributes.proposed_inhouse_code as string | undefined;
  const approve = async () => {
    setApproveError(null);
    try {
      const attributes = { ...x.org.attributes };
      delete attributes.proposed_inhouse_code;
      await updateOrgTaxon(orgId, x.id, { inhouse_code: proposed, attributes });
      await refresh();
    } catch (e) {
      const err = e as Error & { code?: string };
      setApproveError(err.code === '23505' ? t('taxa.form.codeTaken') : err.message);
    }
  };
  const orgNames = x.org.attributes.common_names ?? {};
  const names = (lang: 'en' | 'ar') =>
    [...new Set([...(orgNames[lang] ?? []), ...(x.common_names[lang] ?? [])])].join(', ');
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  const total = Object.values(x.plants_by_status).reduce((a, b) => a + b, 0);
  // Field keys contain dots (attributes.common_names), so read the label map as an object.
  const fieldLabels = t('taxa.field', { returnObjects: true }) as Record<string, string>;

  return (
    <section className="mx-auto max-w-5xl p-4">
      <Link to="/taxa" className="text-sm underline">
        {t('taxa.back')}
      </Link>
      <header className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">
          <i>{x.scientific_name}</i>{' '}
          <span className="text-base font-normal text-gray-600">{x.authorship}</span>
        </h1>
        {x.org.inhouse_code && (
          <span className="rounded bg-green-100 px-2 font-mono text-green-900" dir="ltr">
            {x.org.inhouse_code}
          </span>
        )}
        {isCurator && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="ms-auto rounded bg-green-800 px-3 py-1 text-sm font-medium text-white"
          >
            {t('taxa.edit')}
          </button>
        )}
      </header>

      {proposed && !x.org.inhouse_code && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span>
            {t('taxa.proposedNote')}{' '}
            <span className="font-mono font-semibold" dir="ltr">
              {proposed}
            </span>
          </span>
          {isCurator && (
            <button
              type="button"
              onClick={() => void approve()}
              className="rounded bg-amber-700 px-3 py-1 text-white"
            >
              {t('taxa.approveCode')}
            </button>
          )}
          {approveError && (
            <span role="alert" className="text-red-700">
              {approveError}
            </span>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-1 font-semibold">{t('taxa.taxonomy')}</h2>
          <dl>
            <Row label={t('taxa.col.family')}>{x.family}</Row>
            <Row label={t('taxa.rank')}>{t(`rank.${x.rank}`, { defaultValue: x.rank })}</Row>
            <Row label={t('taxa.namesEn')}>{names('en')}</Row>
            <Row label={t('taxa.namesAr')}>
              {names('ar') && (
                <span lang="ar" dir="rtl">
                  {names('ar')}
                </span>
              )}
            </Row>
            <Row label={t('taxa.accepted')}>
              {x.accepted && (
                <Link to={`/taxa/${x.accepted.id}`} className="underline">
                  <i>{x.accepted.scientific_name}</i>
                </Link>
              )}
            </Row>
            <Row label={t('taxa.life')}>
              {show(x.org.attributes.life_forms) !== '∅' ? show(x.org.attributes.life_forms) : ''}
            </Row>
            <Row label={t('taxa.distribution')}>
              {(x.org.attributes.native_distribution as string) ?? ''}
            </Row>
          </dl>
        </div>
        <div>
          <h2 className="mb-1 font-semibold">
            {t('taxa.terraFields', { org: current?.organisationName })}
          </h2>
          {editing ? (
            <CuratorForm
              orgId={orgId}
              taxonId={x.id}
              org={x.org}
              onSaved={() => void refresh()}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <dl>
              <Row label={t('taxa.form.code')}>{x.org.inhouse_code}</Row>
              <Row label={t('taxa.form.iucn')}>
                {x.org.iucn_category &&
                  `${x.org.iucn_category} ${t(`iucn.${x.org.iucn_category}`)}`}
              </Row>
              <Row label={t('taxa.form.protection')}>{x.org.protection_level}</Row>
              <Row label={t('taxa.form.origin')}>{x.org.origin && t(`origin.${x.org.origin}`)}</Row>
              <Row label={t('taxa.form.sensitive')}>{x.org.sensitive ? t('taxa.yes') : ''}</Row>
              <Row label={t('taxa.form.zones')}>{(x.org.zones_present ?? []).join(', ')}</Row>
              <Row label={t('taxa.form.notes')}>{x.org.notes}</Row>
              <Row label={t('taxa.plants')}>
                <Link
                  to={`/assets?q=${encodeURIComponent(x.scientific_name)}`}
                  className="underline"
                >
                  {total.toLocaleString(i18n.language)}
                </Link>
                {Object.keys(x.plants_by_zone).length > 0 && (
                  <span className="text-gray-600">
                    {' · '}
                    {Object.entries(x.plants_by_zone)
                      .sort()
                      .map(([z, n]) => `${z} ${n}`)
                      .join(', ')}
                  </span>
                )}
                {Object.entries(x.plants_by_status)
                  .filter(([s]) => s !== 'established')
                  .map(([s, n]) => (
                    <span key={s} className="text-gray-600">{` · ${t(`status.${s}`)} ${n}`}</span>
                  ))}
              </Row>
            </dl>
          )}
        </div>
      </div>

      {canSeeHistory && (
        <section className="mt-6">
          <h2 className="mb-2 font-semibold">{t('taxa.history')}</h2>
          <ol className="border-s-2 border-green-800/30 ps-4" data-testid="taxon-history">
            {(history.data ?? []).map((h, i) => (
              <li key={`${h.at}-${i}`} className="relative mb-3 text-sm">
                <span
                  aria-hidden
                  className="absolute -start-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-green-800"
                />
                {h.action === 'update' ? (
                  <ul>
                    {h.fields.map((c) => (
                      <li key={c.field}>
                        {t('taxa.changed', {
                          field: fieldLabels[c.field] ?? c.field,
                          from: show(c.from),
                          to: show(c.to),
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t(`taxa.historyAction.${h.action}`)}</p>
                )}
                <p className="text-xs text-gray-500">
                  {when(h.at)} · {h.by ?? t('taxa.system')}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
