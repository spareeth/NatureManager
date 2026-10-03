import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { AssetForm } from './AssetForm';
import type { AssetDetail } from './api';

const api = vi.hoisted(() => ({
  fetchAssetTypeOptions: vi.fn(),
  searchTaxa: vi.fn(),
  fetchAccessions: vi.fn(),
  findAssetByTag: vi.fn(),
  suggestTag: vi.fn(),
  checkTag: vi.fn(),
  createAsset: vi.fn(),
  updateAsset: vi.fn(),
  setAssetStatus: vi.fn(),
}));
vi.mock('./editApi', () => api);

const TYPES = [
  {
    id: 'tree',
    code: 'TREE',
    name: 'Tree',
    name_ar: 'شجرة',
    asset_class: 'living',
    attribute_schema: {
      type: 'object',
      properties: { height_m: { type: 'number', minimum: 0, title: 'Height (m)' } },
    },
  },
  {
    id: 'group',
    code: 'GROUP',
    name: 'Planting group',
    name_ar: null,
    asset_class: 'living',
    attribute_schema: {},
  },
  {
    id: 'valve',
    code: 'VALVE',
    name: 'Irrigation valve',
    name_ar: null,
    asset_class: 'built',
    attribute_schema: {
      type: 'object',
      properties: {
        valve_type: { type: 'string', enum: ['solenoid', 'gate'], title: 'Valve type' },
      },
    },
  },
];

function renderForm(props: Partial<Parameters<typeof AssetForm>[0]> = {}) {
  const onSaved = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AssetForm orgId="o1" siteId="s1" onSaved={onSaved} onCancel={() => {}} {...props} />
    </QueryClientProvider>,
  );
  return { onSaved };
}
const point = {
  ewkt: 'SRID=4326;POINT(55.15 24.95)',
  anchorEwkt: 'SRID=4326;POINT(55.15 24.95)',
  polygon: false,
};

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchAssetTypeOptions.mockResolvedValue(TYPES);
  api.searchTaxa.mockResolvedValue([
    {
      id: 'tx1',
      scientific_name: 'Prosopis cineraria',
      inhouse_code: 'PRO',
      common_names: { en: ['Ghaf'] },
    },
  ]);
  api.fetchAccessions.mockResolvedValue([]);
  api.findAssetByTag.mockResolvedValue([]);
  api.suggestTag.mockImplementation(async ({ taxonId }: { taxonId?: string }) =>
    taxonId ? 'WG07-T12_PRO' : 'WG07-T12_XXX',
  );
  api.checkTag.mockResolvedValue({ pattern_ok: true, taken_by: null });
  api.createAsset.mockResolvedValue('new-id');
});

describe('AssetForm, create', () => {
  it('suggests a tag, follows the species, and creates the asset', async () => {
    const { onSaved } = renderForm({ geometry: point });
    await screen.findByRole('option', { name: 'Tree' });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'tree' } });
    await waitFor(() => expect(screen.getByLabelText('Tag')).toHaveValue('WG07-T12_XXX'));
    fireEvent.change(screen.getByLabelText('Species'), { target: { value: 'pro' } });
    fireEvent.click(await screen.findByRole('option', { name: /Prosopis cineraria/ }));
    await waitFor(() => expect(screen.getByLabelText('Tag')).toHaveValue('WG07-T12_PRO'));
    expect(screen.getByLabelText('Status')).toHaveValue('planted');
    fireEvent.change(screen.getByLabelText('Height (m)'), { target: { value: '6,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('new-id'));
    expect(api.createAsset).toHaveBeenCalledWith(
      'o1',
      's1',
      point.ewkt,
      'planted',
      expect.objectContaining({
        asset_type_id: 'tree',
        tag_code: 'WG07-T12_PRO',
        taxon_id: 'tx1',
        attributes: { height_m: 6.5 },
      }),
    );
  });

  it('blocks a taken tag and invalid attributes', async () => {
    api.checkTag.mockResolvedValue({ pattern_ok: true, taken_by: 'other' });
    renderForm({ geometry: point });
    await screen.findByRole('option', { name: 'Tree' });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'tree' } });
    expect(await screen.findByText('This tag is already used.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This tag is already used.');
    api.checkTag.mockResolvedValue({ pattern_ok: true, taken_by: null });
    fireEvent.change(screen.getByLabelText('Tag'), { target: { value: 'wg07-t13_pro' } });
    expect(screen.getByLabelText('Tag')).toHaveValue('WG07-T13_PRO');
    fireEvent.change(screen.getByLabelText('Height (m)'), { target: { value: '-2' } });
    await waitFor(() =>
      expect(screen.getByTestId('tag-hint')).not.toHaveTextContent('already used'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create asset' }));
    expect(await screen.findByText('Must be at least 0.')).toBeInTheDocument();
    expect(api.createAsset).not.toHaveBeenCalled();
  });

  it('built types offer built statuses and no species field', async () => {
    renderForm({ geometry: point });
    await screen.findByRole('option', { name: 'Irrigation valve' });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'valve' } });
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('active'));
    expect(screen.queryByLabelText('Species')).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Out of service' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Planted' })).not.toBeInTheDocument();
  });

  it('a polygon offers only living types', async () => {
    renderForm({ geometry: { ...point, polygon: true } });
    await screen.findByRole('option', { name: 'Tree' });
    expect(screen.queryByRole('option', { name: 'Irrigation valve' })).not.toBeInTheDocument();
  });
});

describe('AssetForm, edit', () => {
  const asset = {
    id: 'a1',
    site_id: 's1',
    tag_code: 'WG07-T04_PRO',
    barcode: null,
    name: null,
    status: 'established',
    condition: 4,
    criticality: null,
    install_date: null,
    plant_count: null,
    attributes: { height_m: 6, hortis_note: 'x' },
    legacy_hortis_id: null,
    geometry: { type: 'Point', coordinates: [0, 0] },
    lon: 0,
    lat: 0,
    local_x: null,
    local_y: null,
    position_source: 'hortis',
    position_accuracy_m: null,
    created_at: '',
    updated_at: '',
    type: {
      id: 'tree',
      code: 'TREE',
      name: 'Tree',
      asset_class: 'living',
      attribute_schema: TYPES[0]!.attribute_schema,
    },
    taxon: {
      id: 'tx1',
      scientific_name: 'Prosopis cineraria',
      authorship: null,
      family: null,
      common_names: {},
      inhouse_code: 'PRO',
      iucn_category: null,
      origin: null,
      sensitive: false,
    },
    accession: null,
    location: null,
    parent: null,
    children: [],
  } as unknown as AssetDetail;

  it('saves fields, then the status change with its reason', async () => {
    const { onSaved } = renderForm({ asset });
    expect(await screen.findByLabelText('Tag')).toHaveValue('WG07-T04_PRO');
    expect(api.suggestTag).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'declining' } });
    fireEvent.change(screen.getByLabelText('Reason for the status change'), {
      target: { value: 'Borer damage' },
    });
    await waitFor(() =>
      expect(api.checkTag).toHaveBeenCalledWith('o1', 'WG07-T04_PRO', 'living', 'a1'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith('a1'));
    expect(api.updateAsset).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ condition: 2, attributes: { hortis_note: 'x', height_m: 6 } }),
    );
    expect(api.setAssetStatus).toHaveBeenCalledWith('a1', 'declining', 'Borer damage');
  });
});
