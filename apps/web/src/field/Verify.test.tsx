import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { VerifyQueue, VerifyScreen } from './Verify';
import type { FieldJob } from './api';

const api = vi.hoisted(() => ({
  fetchJob: vi.fn(),
  fetchVerifyQueue: vi.fn(),
  moveJob: vi.fn(),
  signedPhoto: vi.fn(),
}));
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

function renderAt(path: string, roles: Role[] = ['field_manager']) {
  const org: OrgState = {
    memberships: [],
    loading: false,
    error: null,
    switchOrg: () => {},
    current: {
      organisationId: 'o1',
      organisationName: 'Terra',
      organisationSlug: 'terra',
      roles,
      displayName: 'Terra Field Manager',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/field/verify" element={<VerifyQueue />} />
            <Route path="/field/verify/:id" element={<VerifyScreen />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

const JOB = {
  id: 'w1',
  organisation_id: 'o1',
  number: 'WO-2026-000001',
  title: 'Bed care NG-01',
  status: 'completed',
  priority: 'P3',
  location: { id: 'l1', code: 'NG-01' },
  assignee_name: 'Green One',
  mine: false,
  completion_notes: 'Weeded',
  actual_minutes: 40,
  materials: [{ item: 'mulch', qty: 2, unit: 'm3' }],
  photos: [],
  events: [
    {
      at: '2026-11-02T08:00:00Z',
      from: 'in_progress',
      to: 'completed',
      note: null,
      source: 'user',
      by: 'Green One',
    },
  ],
  sop: {
    id: 'v1',
    code: 'SOP-BED',
    version: 1,
    title: { en: 'Bed care' },
    ppe: null,
    hazards: null,
  },
  steps: [
    {
      id: 's1',
      seq: 1,
      text: { en: 'Weed the bed' },
      input_type: 'tick',
      choices: null,
      unit: null,
      required: true,
      media_path: null,
      value: true,
      media_id: null,
      media_path_answer: null,
    },
    {
      id: 's2',
      seq: 2,
      text: { en: 'Mulch depth' },
      input_type: 'number',
      choices: null,
      unit: 'cm',
      required: false,
      media_path: null,
      value: 7,
      media_id: null,
      media_path_answer: null,
    },
  ],
  missing: [],
} as unknown as FieldJob;

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchJob.mockResolvedValue({ data: JOB, offline: false });
  api.moveJob.mockResolvedValue(undefined);
  api.signedPhoto.mockResolvedValue(null);
});

describe('verification', () => {
  it('lists completed jobs with who did them', async () => {
    api.fetchVerifyQueue.mockResolvedValue({
      offline: false,
      data: [
        {
          id: 'w1',
          number: 'WO-1',
          title: 'Bed care NG-01',
          priority: 'P3',
          wo_type: 'preventive',
          location_code: 'NG-01',
          completed_at: '2026-11-02T08:00:00Z',
          completed_by_name: 'Green One',
          assignee_name: 'Green One',
          team_name: null,
          photos: 2,
          steps: 2,
          can_verify: true,
        },
      ],
    });
    renderAt('/field/verify');
    expect(await screen.findByRole('link', { name: /Bed care NG-01/ })).toHaveAttribute(
      'href',
      '/field/verify/w1',
    );
    expect(screen.getByText(/done by Green One/)).toBeInTheDocument();
    expect(screen.getByText(/2 photos/)).toBeInTheDocument();
  });

  it('shows the answers and passes only when every check is ticked', async () => {
    renderAt('/field/verify/w1');
    expect(await screen.findByText('7 cm')).toBeInTheDocument();
    const pass = screen.getByRole('button', { name: 'Pass, verified' });
    expect(pass).toBeDisabled();
    for (const box of screen.getAllByRole('checkbox')) fireEvent.click(box);
    expect(pass).toBeEnabled();
    fireEvent.click(pass);
    await waitFor(() =>
      expect(api.moveJob).toHaveBeenCalledWith(
        JOB,
        'verified',
        expect.stringContaining('Work done as the SOP says'),
      ),
    );
  });

  it('fails with a reason, back to in progress', async () => {
    renderAt('/field/verify/w1');
    fireEvent.click(await screen.findByRole('button', { name: 'Fail, send back' }));
    const send = screen.getByRole('button', { name: 'Send back to the team' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What needs fixing?'), {
      target: { value: 'Mulch missing' },
    });
    fireEvent.click(send);
    await waitFor(() =>
      expect(api.moveJob).toHaveBeenCalledWith(JOB, 'in_progress', 'Mulch missing'),
    );
  });

  it('the person who did the job cannot verify it; other roles cannot open it', async () => {
    api.fetchJob.mockResolvedValue({ data: { ...JOB, mine: true }, offline: false });
    renderAt('/field/verify/w1');
    expect(await screen.findByText(/someone else must verify it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pass, verified' })).toBeNull();
  });

  it('green team cannot verify', () => {
    renderAt('/field/verify', ['green_team']);
    expect(screen.getByText('Only managers and field managers verify work.')).toBeInTheDocument();
  });
});
