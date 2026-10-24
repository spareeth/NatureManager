import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { ItemsNeeded } from './ItemsNeeded';
import type { FieldJob } from './api';

const api = vi.hoisted(() => ({ fetchCatalogue: vi.fn(), queueJobItems: vi.fn() }));
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }));

const JOB = {
  id: 'w1',
  organisation_id: 'o1',
  assets: [{ id: 'a1', tag_code: 'NG01-T01_PRO' }],
  item_requests: [
    {
      id: 'r0',
      number: 'IR-2026-000003',
      status: 'submitted',
      lines: [{ description: 'Tree tie', quantity: 4, unit: 'each', reason: 'maintain' }],
    },
  ],
} as unknown as FieldJob;

function renderIt(disabled = false) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ItemsNeeded job={JOB} disabled={disabled} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchCatalogue.mockResolvedValue({
    offline: false,
    data: [{ id: 'i2', code: 'MUL-01', name: 'Mulch', category: 'soil_amendment', unit: 'm3' }],
  });
  api.queueJobItems.mockResolvedValue(undefined);
});

describe('items needed on the job', () => {
  it('shows requests already raised from the job', () => {
    renderIt(true);
    expect(screen.getByText(/IR-2026-000003/)).toBeInTheDocument();
    expect(screen.getByText(/4 each Tree tie/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add to list' })).toBeNull();
  });

  it('adds a catalogue item and a typed one, then queues one request', async () => {
    renderIt();
    await screen.findByRole('option', { name: 'Mulch (MUL-01)' });
    fireEvent.change(screen.getByLabelText('Catalogue item'), { target: { value: 'i2' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Drip emitter 4 L/h' },
    });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'replace' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request 2 items' }));
    await waitFor(() =>
      expect(api.queueJobItems).toHaveBeenCalledWith(JOB, [
        {
          item_id: 'i2',
          description: 'Mulch',
          quantity: 2,
          unit: 'm3',
          reason: 'maintain',
          asset_id: 'a1',
        },
        {
          item_id: null,
          description: 'Drip emitter 4 L/h',
          quantity: 10,
          unit: 'each',
          reason: 'replace',
          asset_id: 'a1',
        },
      ]),
    );
    expect(
      await screen.findByText(/sent for approval as soon as there is network/),
    ).toBeInTheDocument();
  });
});
