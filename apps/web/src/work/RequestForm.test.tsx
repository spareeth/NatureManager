import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { RequestForm } from './RequestForm';

const db = vi.hoisted(() => ({
  rows: [
    { id: 'l1', code: 'NG-01', kind: 'bed' },
    { id: 'z1', code: 'NG', kind: 'zone' },
  ],
}));
vi.mock('../lib/supabase', () => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: async () => ({ data: db.rows, error: null }),
  };
  return { supabase: { from: () => chain } };
});

function renderForm(props: Partial<Parameters<typeof RequestForm>[0]> = {}) {
  const send = vi.fn().mockResolvedValue({ id: 'w1', number: 'WO-2026-000001' });
  const attach = vi.fn().mockResolvedValue(undefined);
  const onDone = vi.fn();
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <RequestForm
          orgId="o1"
          siteId="s1"
          onDone={onDone}
          onCancel={() => {}}
          submit={send}
          attach={attach}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { send, onDone, attach };
}

beforeEach(() => vi.clearAllMocks());

describe('request form', () => {
  it('a spot from the map is sent as the request position', async () => {
    const { send } = renderForm({ point: { lat: 24.9588, lon: 55.1545 } });
    expect(screen.getByTestId('request-point')).toHaveTextContent('24.958800, 55.154500');
    expect(screen.queryByLabelText('Where (bed or zone)')).toBeNull();
    fireEvent.change(screen.getByLabelText('What is wrong?'), {
      target: { value: 'Leaking valve' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          woType: 'reactive',
          geom: 'SRID=4326;POINT(55.1545 24.9588)',
          locationId: null,
        }),
      ),
    );
  });

  it('without a spot or asset it asks for the bed; an improvement is a project', async () => {
    const { send } = renderForm();
    fireEvent.click(screen.getByLabelText('Improvement or modification'));
    fireEvent.change(await screen.findByLabelText('Where (bed or zone)'), {
      target: { value: 'l1' },
    });
    await screen.findByRole('option', { name: 'NG-01' });
    fireEvent.change(screen.getByLabelText('Where (bed or zone)'), { target: { value: 'l1' } });
    fireEvent.change(screen.getByLabelText('What should change?'), {
      target: { value: 'Add edging along the path' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ woType: 'project', locationId: 'l1', geom: null }),
      ),
    );
  });

  it('photos are sent after the request is created, up to three', async () => {
    const { send, attach, onDone } = renderForm({ point: { lat: 24.95, lon: 55.15 } });
    const input = screen.getByLabelText('Add photo');
    const file = (n: string) => new File(['x'], n, { type: 'image/jpeg' });
    for (const n of ['a.jpg', 'b.jpg', 'c.jpg'])
      fireEvent.change(screen.getByLabelText('Add photo'), { target: { files: [file(n)] } });
    expect(screen.queryByLabelText('Add photo')).toBeNull(); // three is the limit
    expect(input).toBeDefined();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove photo' })[2]!);
    fireEvent.change(screen.getByLabelText('What is wrong?'), {
      target: { value: 'Broken bench' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(send).toHaveBeenCalled());
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(attach).toHaveBeenCalledWith('o1', 'w1', {
      photos: [
        expect.objectContaining({ name: 'a.jpg' }),
        expect.objectContaining({ name: 'b.jpg' }),
      ],
      voice: null,
    });
  });

  it('without attachments nothing is uploaded', async () => {
    const { attach, onDone } = renderForm({ point: { lat: 24.95, lon: 55.15 } });
    fireEvent.change(screen.getByLabelText('What is wrong?'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(attach).not.toHaveBeenCalled();
  });

  it('points to item requests for parts and materials', () => {
    renderForm();
    expect(screen.getByRole('link', { name: 'Raise an item request instead.' })).toHaveAttribute(
      'href',
      '/requests',
    );
  });
});
