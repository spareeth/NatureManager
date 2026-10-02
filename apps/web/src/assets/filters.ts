// Asset list filters, kept in the URL so a filtered list can be shared or bookmarked.

export const SORTS = [
  'tag_code',
  'scientific_name',
  'type',
  'location',
  'status',
  'condition',
  'updated_at',
] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export type AssetFilters = {
  q: string;
  assetClass: 'living' | 'built' | '';
  type: string;
  status: string[];
  location: string;
  sort: Sort;
  desc: boolean;
  page: number; // 1-based
};

export const EMPTY_FILTERS: AssetFilters = {
  q: '',
  assetClass: '',
  type: '',
  status: [],
  location: '',
  sort: 'tag_code',
  desc: false,
  page: 1,
};

export function parseFilters(params: URLSearchParams): AssetFilters {
  const cls = params.get('class');
  const sort = params.get('sort') as Sort | null;
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? '',
    assetClass: cls === 'living' || cls === 'built' ? cls : '',
    type: params.get('type') ?? '',
    status: (params.get('status') ?? '').split(',').filter(Boolean),
    location: params.get('location') ?? '',
    sort: sort && SORTS.includes(sort) ? sort : 'tag_code',
    desc: params.get('desc') === '1',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** Only non-default values go in the URL. */
export function toParams(f: AssetFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.assetClass) p.set('class', f.assetClass);
  if (f.type) p.set('type', f.type);
  if (f.status.length) p.set('status', f.status.join(','));
  if (f.location) p.set('location', f.location);
  if (f.sort !== 'tag_code') p.set('sort', f.sort);
  if (f.desc) p.set('desc', '1');
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

/** Clicking the current sort column flips direction; a new column starts ascending. */
export function toggleSort(f: AssetFilters, sort: Sort): AssetFilters {
  return { ...f, sort, desc: f.sort === sort ? !f.desc : false, page: 1 };
}

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}
