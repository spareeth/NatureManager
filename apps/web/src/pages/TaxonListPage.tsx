import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { listTaxa } from '../taxa/api';
import {
  parseTaxonFilters,
  TAXA_PAGE,
  taxonParams,
  type TaxonFilters,
  type TaxonSort,
} from '../taxa/filters';

const IUCN = ['EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'];
const ORIGINS = ['native', 'endemic', 'naturalised', 'exotic', 'unknown'];
const ZONES = ['EG', 'NG', 'SG', 'WG'];

function SortTh({
  sort,
  label,
  f,
  onSort,
}: {
  sort: TaxonSort;
  label: string;
  f: TaxonFilters;
  onSort: (s: TaxonSort) => void;
}) {
  const active = f.sort === sort;
  return (
    <th
      scope="col"
      className="py-2 pe-3 text-start font-medium"
      aria-sort={active ? (f.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" className="hover:underline" onClick={() => onSort(sort)}>
        {label}
        {active && <span aria-hidden>{f.desc ? ' ▼' : ' ▲'}</span>}
      </button>
    </th>
  );
}

export function TaxonListPage() {
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const [params, setParams] = useSearchParams();
  const f = useMemo(() => parseTaxonFilters(params), [params]);
  const [q, setQ] = useState(f.q);
  const update = (n: TaxonFilters) => setParams(taxonParams(n), { replace: true });
  const onSort = (sort: TaxonSort) =>
    update({ ...f, sort, desc: f.sort === sort ? !f.desc : sort === 'plants', page: 1 });
  const result = useQuery({
    queryKey: ['taxa', current?.organisationId, f],
    enabled: !!current,
    queryFn: () => listTaxa(current!.organisationId, f),
    placeholderData: keepPreviousData,
  });
  const total = result.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / TAXA_PAGE));
  const nf = (n: number) => n.toLocaleString(i18n.language);
  const ar = i18n.language.startsWith('ar');
  const sel = 'rounded border border-gray-300 px-2 py-1';

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ ...f, q: q.trim(), page: 1 });
  };

  return (
    <section className="flex h-full flex-col p-4">
      <h1 className="text-xl font-semibold">{t('taxa.heading')}</h1>
      <form
        onSubmit={onSearch}
        role="search"
        className="mt-3 flex flex-wrap items-end gap-3 text-sm"
      >
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.search')}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('taxa.searchHint')}
            className="w-64 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('taxa.iucn')}</span>
          <select
            value={f.iucn}
            onChange={(e) => update({ ...f, iucn: e.target.value, page: 1 })}
            className={sel}
          >
            <option value="">{t('assets.all')}</option>
            {IUCN.map((c) => (
              <option key={c} value={c}>
                {c} {t(`iucn.${c}`)}
              </option>
            ))}
            <option value="none">{t('taxa.iucnNone')}</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('taxa.origin')}</span>
          <select
            value={f.origin}
            onChange={(e) => update({ ...f, origin: e.target.value, page: 1 })}
            className={sel}
          >
            <option value="">{t('assets.all')}</option>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {t(`origin.${o}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('taxa.zone')}</span>
          <select
            value={f.zone}
            onChange={(e) => update({ ...f, zone: e.target.value, page: 1 })}
            className={sel}
          >
            <option value="">{t('assets.all')}</option>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {z} {t(`map.zones.${z}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('taxa.code')}</span>
          <select
            value={f.code}
            onChange={(e) =>
              update({ ...f, code: e.target.value as TaxonFilters['code'], page: 1 })
            }
            className={sel}
          >
            <option value="">{t('assets.all')}</option>
            <option value="has">{t('taxa.codeHas')}</option>
            <option value="proposed">{t('taxa.codeProposed')}</option>
            <option value="none">{t('taxa.codeNone')}</option>
          </select>
        </label>
        <button type="submit" className="rounded bg-green-800 px-3 py-1.5 font-medium text-white">
          {t('assets.searchButton')}
        </button>
        {params.toString() && (
          <button
            type="button"
            className="py-1.5 underline"
            onClick={() => {
              setQ('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            {t('assets.clear')}
          </button>
        )}
      </form>

      <p className="mt-3 text-sm text-gray-600" role="status" data-testid="taxon-total">
        {result.data ? t('taxa.total', { count: total, n: nf(total) }) : t('common.loading')}
      </p>
      {result.error && (
        <p role="alert" className="text-red-700">
          {result.error.message}
        </p>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b text-gray-600">
              <SortTh sort="scientific_name" label={t('taxa.col.name')} f={f} onSort={onSort} />
              <th scope="col" className="py-2 pe-3 text-start font-medium">
                {t('taxa.col.common')}
              </th>
              <SortTh sort="family" label={t('taxa.col.family')} f={f} onSort={onSort} />
              <SortTh sort="code" label={t('taxa.col.code')} f={f} onSort={onSort} />
              <SortTh sort="iucn" label={t('taxa.col.iucn')} f={f} onSort={onSort} />
              <th scope="col" className="py-2 pe-3 text-start font-medium">
                {t('taxa.col.zones')}
              </th>
              <SortTh sort="plants" label={t('taxa.col.plants')} f={f} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {(result.data?.rows ?? []).map((r) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="py-1.5 pe-3">
                  <Link to={`/taxa/${r.id}`} className="text-green-800 underline">
                    <i>{r.scientific_name}</i>
                  </Link>
                  {r.sensitive && (
                    <span className="ms-1 rounded bg-amber-100 px-1 text-xs text-amber-900">
                      {t('taxa.sensitive')}
                    </span>
                  )}
                </td>
                <td className="py-1.5 pe-3">{(ar ? r.common_ar : null) ?? r.common_en ?? ''}</td>
                <td className="py-1.5 pe-3">{r.family ?? ''}</td>
                <td className="py-1.5 pe-3 font-mono" dir="ltr">
                  {r.inhouse_code ??
                    (r.proposed_code ? (
                      <span className="text-gray-400" title={t('taxa.codeProposed')}>
                        {r.proposed_code}?
                      </span>
                    ) : (
                      ''
                    ))}
                </td>
                <td className="py-1.5 pe-3">{r.iucn_category ?? ''}</td>
                <td className="py-1.5 pe-3 font-mono text-xs" dir="ltr">
                  {(r.zones_present ?? []).join(' ')}
                </td>
                <td className="py-1.5 pe-3">
                  <Link
                    to={`/assets?q=${encodeURIComponent(r.scientific_name)}`}
                    className="underline"
                  >
                    {nf(r.plants)}
                  </Link>
                  {r.dead > 0 && (
                    <span className="ms-1 text-xs text-gray-500">
                      ({t('taxa.deadCount', { n: nf(r.dead) })})
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > TAXA_PAGE && (
        <nav className="mt-2 flex items-center gap-3 text-sm" aria-label={t('assets.pages')}>
          <button
            type="button"
            disabled={f.page <= 1}
            onClick={() => update({ ...f, page: f.page - 1 })}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            {t('assets.prev')}
          </button>
          <span>{t('assets.page', { page: nf(f.page), pages: nf(pages) })}</span>
          <button
            type="button"
            disabled={f.page >= pages}
            onClick={() => update({ ...f, page: f.page + 1 })}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            {t('assets.next')}
          </button>
        </nav>
      )}
    </section>
  );
}
