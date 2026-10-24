import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { HandoffPanel } from './HandoffPanel';
import type { ExportRow } from './format';

const api = vi.hoisted(() => ({
  fetchPreview: vi.fn(),
  exportBatch: vi.fn(),
  fetchBatchRows: vi.fn(),
  fetchBatches: vi.fn(),
  fetchReceivers: vi.fn(),
  createReceiver: vi.fn(),
  rotateKey: vi.fn(),
  setReceiverActive: vi.fn(),
}));
const fmt = vi.hoisted(() => ({ downloadRows: vi.fn() }));
vi.mock('./api', () => api);
vi.mock('./format', async (orig) => ({ ...(await orig<typeof import('./format')>()), ...fmt }));

const row = (n: string, category: string): ExportRow => ({
  batch_id: null,
  request_number: n,
  line_no: 1,
  organisation: 'terra',
  site_code: 'TG',
  location_code: 'NG-01',
  reason: 'maintain',
  category,
  item_code: null,
  external_code: 'ECD-1',
  description: 'Mulch',
  quantity: 2,
  unit: 'm3',
  needed_by: null,
  est_unit_cost_aed: null,
  linked_asset_tag: null,
  linked_work_order: null,
  requested_by: null,
  approved_by: null,
  approved_at: null,
});

function renderIt() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HandoffPanel orgId="o1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchPreview.mockResolvedValue([
    row('IR-2026-000001', 'plant'),
    row('IR-2026-000002', 'soil_amendment'),
  ]);
  api.fetchBatches.mockResolvedValue([]);
  api.fetchReceivers.mockResolvedValue([]);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('hand-off', () => {
  it('summarises what is waiting by category', async () => {
    renderIt();
    expect(
      await screen.findByText(
        '2 lines in 2 requests (Plant 1, Soil amendment 1)',
        {},
        { timeout: 4000 },
      ),
    ).toHaveAttribute('data-testid', 'handoff-summary');
  });

  it('exports one batch and downloads it in the chosen format', async () => {
    const rows = [row('IR-2026-000001', 'plant')];
    api.exportBatch.mockResolvedValue({ batch_id: 'abcdef12-0000-0000-0000-000000000000', rows });
    renderIt();
    const btn = await screen.findByRole('button', { name: 'Export XLSX' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() =>
      expect(fmt.downloadRows).toHaveBeenCalledWith(
        rows,
        'abcdef12-0000-0000-0000-000000000000',
        'xlsx',
      ),
    );
    expect(await screen.findByText('Exported 1 lines as batch abcdef12.')).toBeInTheDocument();
  });

  it('shows a new receiver key once', async () => {
    api.createReceiver.mockResolvedValue({ id: 'r1', api_key: 'tgk_abc123' });
    renderIt();
    fireEvent.change(await screen.findByLabelText('Receiver name'), {
      target: { value: 'ECD procurement' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add receiver' }));
    expect(await screen.findByTestId('api-key')).toHaveTextContent('tgk_abc123');
    expect(api.createReceiver).toHaveBeenCalledWith('o1', 'ECD procurement');
  });
});
