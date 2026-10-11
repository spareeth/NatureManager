import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import { fetchAssetTypes, fetchSiteLocations, searchAssets } from '../assets/api';
import {
  PAGE_SIZE,
  pageCount,
  parseFilters,
  toggleSort,
  toParams,
  type AssetFilters,
  type Sort,
} from '../assets/filters';
import { StatusBadge } from '../assets/StatusBadge';
import { useTypeName } from '../assets/useTypeNames';
import { LabelDialog } from '../labels/LabelDialog';
import { idsForFilters } from '../labels/api';

const STATUSES = [
  'planned',
  'planted',
  'established',
  'active',
  'declining',
  'dead',
  'removed',
  'out_of_service',
  'disposed',
];

function SortHeader({
  sort,
  label,
  filters,
  onSort,
}: {
  sort: Sort;
  label: string;
  filters: AssetFilters;
  onSort: (sort: Sort) => void;
}) {
  const active = filters.sort === sort;
  return (
    <th
      scope="col"
      className="py-2 pe-3 text-start font-medium"
      aria-sort={active ? (filters.desc ? 'descending' : 'ascending') : 'none'}
    >
      <button type="button" className="hover:underline" onClick={() => onSort(sort)}>
        {label}
        {active && <span aria-hidden>{filters.desc ? ' ▼' : ' ▲'}</span>}
      </button>
    </th>
  );
}

export function AssetListPage() {
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const typeName = useTypeName();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const [q, setQ] = useState(filters.q);
  const [printing, setPrinting] = useState(false);
  const update = (f: AssetFilters) => setParams(toParams(f), { replace: true });

  const types = useQuery({
    queryKey: ['asset-types', current?.organisationId],
    enabled: !!current,
    queryFn: () => fetchAssetTypes(current!.organisationId),
  });
  const locations = useQuery({
    queryKey: ['site-locations', site?.id],
    enabled: !!site,
    queryFn: () => fetchSiteLocations(site!.id),
  });
  const result = useQuery({
    queryKey: ['asset-search', site?.id, filters],
    enabled: !!site,
    queryFn: () => searchAssets(site!.id, filters),
    placeholderData: keepPreviousData,
  });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    update({ ...filters, q: q.trim(), page: 1 });
  };
  const onSort = (sort: Sort) => update(toggleSort(filters, sort));
  const total = result.data?.total ?? 0;
  const pages = pageCount(total);
  const nf = (n: number) => n.toLocaleString(i18n.language);

  return (
    <section className="flex h-full flex-col p-4">
      <h1 className="text-xl font-semibold">{t('assets.heading')}</h1>

      <form
        onSubmit={onSearch}
        className="mt-3 flex flex-wrap items-end gap-3 text-sm"
        role="search"
      >
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.search')}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('assets.searchHint')}
            className="w-64 rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.class')}</span>
          <select
            value={filters.assetClass}
            onChange={(e) =>
              update({
                ...filters,
                assetClass: e.target.value as AssetFilters['assetClass'],
                type: '',
                page: 1,
              })
            }
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">{t('assets.all')}</option>
            <option value="living">{t('assets.living')}</option>
            <option value="built">{t('assets.built')}</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.type')}</span>
          <select
            value={filters.type}
            onChange={(e) => update({ ...filters, type: e.target.value, page: 1 })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">{t('assets.all')}</option>
            {(types.data ?? [])
              .filter((ty) => !filters.assetClass || ty.asset_class === filters.assetClass)
              .map((ty) => (
                <option key={ty.code} value={ty.code}>
                  {typeName(ty.code, ty.name)}
                </option>
              ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.status')}</span>
          <select
            value={filters.status[0] ?? ''}
            onChange={(e) =>
              update({ ...filters, status: e.target.value ? [e.target.value] : [], page: 1 })
            }
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">{t('assets.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-gray-600">{t('assets.location')}</span>
          <select
            value={filters.location}
            onChange={(e) => update({ ...filters, location: e.target.value, page: 1 })}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="">{t('assets.all')}</option>
            {(locations.data ?? []).map((l) => (
              <option key={l.code} value={l.code}>
                {l.kind === 'zone'
                  ? `${l.code} ${t(`map.zones.${l.code}`, { defaultValue: '' })}`
                  : `  ${l.code}`}
              </option>
            ))}
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

      <div className="mt-3 flex items-center gap-4">
        <p className="text-sm text-gray-600" role="status" data-testid="asset-total">
          {result.data ? t('assets.total', { count: total, n: nf(total) }) : t('common.loading')}
        </p>
        {total > 0 && site && (
          <button
            type="button"
            onClick={() => setPrinting(true)}
            className="rounded border border-green-800 px-3 py-1 text-sm text-green-900"
          >
            {t('labels.printList', { count: total, n: nf(Math.min(total, 2000)) })}
          </button>
        )}
      </div>
      {printing && site && (
        <LabelDialog
          ids={() => idsForFilters(site.id, filters)}
          count={Math.min(total, 2000)}
          onClose={() => setPrinting(false)}
        />
      )}
      {result.error && (
        <p role="alert" className="mt-2 text-red-700">
          {result.error.message}
        </p>
      )}

      <div className="mt-2 min-h-0 flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b text-gray-600">
              <SortHeader
                sort="tag_code"
                label={t('assets.col.tag')}
                filters={filters}
                onSort={onSort}
              />
              <SortHeader
                sort="scientific_name"
                label={t('assets.col.name')}
                filters={filters}
                onSort={onSort}
              />
              <SortHeader
                sort="type"
                label={t('assets.col.type')}
                filters={filters}
                onSort={onSort}
              />
              <SortHeader
                sort="location"
                label={t('assets.col.location')}
                filters={filters}
                onSort={onSort}
              />
              <SortHeader
                sort="status"
                label={t('assets.col.status')}
                filters={filters}
                onSort={onSort}
              />
              <SortHeader
                sort="condition"
                label={t('assets.col.condition')}
                filters={filters}
                onSort={onSort}
              />
              <th scope="col" className="py-2 text-start font-medium">
                {t('assets.col.grid')}
              </th>
            </tr>
          </thead>
          <tbody>
            {(result.data?.rows ?? []).map((a) => (
              <tr key={a.id} className="border-b hover:bg-gray-50">
                <td className="py-1.5 pe-3 font-mono" dir="ltr">
                  <Link to={`/assets/${a.id}`} className="text-green-800 underline">
                    {a.tag_code}
                  </Link>
                </td>
                <td className="py-1.5 pe-3">
                  {a.scientific_name ? <i>{a.scientific_name}</i> : (a.name ?? '')}
                  {a.inhouse_code && <span className="ms-1 text-gray-500">({a.inhouse_code})</span>}
                </td>
                <td className="py-1.5 pe-3">{typeName(a.type_code, a.type_name)}</td>
                <td className="py-1.5 pe-3 font-mono" dir="ltr">
                  {a.location_code ?? ''}
                </td>
                <td className="py-1.5 pe-3">
                  <StatusBadge status={a.status} />
                </td>
                <td className="py-1.5 pe-3">{a.condition ?? ''}</td>
                <td className="py-1.5 font-mono text-xs" dir="ltr">
                  {a.local_x != null && a.local_y != null
                    ? `${Number(a.local_x).toFixed(2)}, ${Number(a.local_y).toFixed(2)}`
                    : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.data && result.data.rows.length === 0 && (
          <p className="mt-6 text-center text-gray-600">{t('assets.none')}</p>
        )}
      </div>

      {total > PAGE_SIZE && (
        <nav className="mt-2 flex items-center gap-3 text-sm" aria-label={t('assets.pages')}>
          <button
            type="button"
            disabled={filters.page <= 1}
            onClick={() => update({ ...filters, page: filters.page - 1 })}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            {t('assets.prev')}
          </button>
          <span>{t('assets.page', { page: nf(filters.page), pages: nf(pages) })}</span>
          <button
            type="button"
            disabled={filters.page >= pages}
            onClick={() => update({ ...filters, page: filters.page + 1 })}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            {t('assets.next')}
          </button>
        </nav>
      )}
    </section>
  );
}
