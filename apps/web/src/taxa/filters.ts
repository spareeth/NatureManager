// Taxa list filters, kept in the URL like the asset list.
export const TAXON_SORTS = ['scientific_name', 'family', 'code', 'iucn', 'plants'] as const;
export type TaxonSort = (typeof TAXON_SORTS)[number];
export const TAXA_PAGE = 50;

export type TaxonFilters = {
  q: string;
  iucn: string;
  origin: string;
  zone: string;
  code: '' | 'has' | 'none' | 'proposed';
  sort: TaxonSort;
  desc: boolean;
  page: number;
};

export const EMPTY_TAXON_FILTERS: TaxonFilters = {
  q: '',
  iucn: '',
  origin: '',
  zone: '',
  code: '',
  sort: 'scientific_name',
  desc: false,
  page: 1,
};

export function parseTaxonFilters(p: URLSearchParams): TaxonFilters {
  const sort = p.get('sort') as TaxonSort | null;
  const code = p.get('code');
  const page = Number(p.get('page'));
  return {
    q: p.get('q') ?? '',
    iucn: p.get('iucn') ?? '',
    origin: p.get('origin') ?? '',
    zone: p.get('zone') ?? '',
    code: code === 'has' || code === 'none' || code === 'proposed' ? code : '',
    sort: sort && TAXON_SORTS.includes(sort) ? sort : 'scientific_name',
    desc: p.get('desc') === '1',
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function taxonParams(f: TaxonFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of ['q', 'iucn', 'origin', 'zone', 'code'] as const) if (f[k]) p.set(k, f[k]);
  if (f.sort !== 'scientific_name') p.set('sort', f.sort);
  if (f.desc) p.set('desc', '1');
  if (f.page > 1) p.set('page', String(f.page));
  return p;
}

/** Three upper-case letters, the Terra in-house species code. */
export const CODE_RE = /^[A-Z]{3}$/;
