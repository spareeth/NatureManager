import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { FieldPage } from '../pages/FieldPage';
import { isAnswered, type FieldJob } from './api';

const api = vi.hoisted(() => ({
  fetchMyDay: vi.fn(),
  fetchJob: vi.fn(),
  moveJob: vi.fn(),
  answerStep: vi.fn(),
  addJobPhoto: vi.fn(),
  signedPhoto: vi.fn(),
  saveJobRecord: vi.fn(),
}));
vi.mock('./api', async (orig) => ({ ...(await orig<typeof import('./api')>()), ...api }));
vi.mock('./SyncBar', () => ({ SyncBar: () => null }));
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));
vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));

function renderAt(path: string, roles: Role[] = ['green_team']) {
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
      displayName: 'G',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/field/*" element={<FieldPage />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

const JOB: FieldJob = {
  id: 'w1',
  organisation_id: 'o1',
  number: 'WO-2026-000001',
  title: 'Bed care NG-01',
  description: null,
  status: 'in_progress',
  priority: 'P3',
  wo_type: 'preventive',
  source: 'pm',
  site_id: 's1',
  planned_start: null,
  planned_end: null,
  due_at: null,
  est_minutes: 60,
  actual_minutes: null,
  materials: [],
  completion_notes: null,
  created_at: '2026-11-01T00:00:00Z',
  created_by_name: null,
  assignee_user_id: 'u1',
  assignee_name: 'Green One',
  team_id: null,
  team_name: null,
  location: { id: 'l1', code: 'NG-01' },
  sop: {
    id: 'v1',
    code: 'SOP-BED',
    version: 2,
    title: { en: 'Bed care' },
    ppe: ['gloves'],
    hazards: null,
  },
  template_code: null,
  lon: null,
  lat: null,
  sla_due: '2026-11-04T00:00:00Z',
  assets: [],
  events: [],
  mine: true,
  steps: [
    {
      id: 'st1',
      seq: 1,
      text: { en: 'Weed the bed', ar: 'إزالة الأعشاب' },
      input_type: 'tick',
      choices: null,
      unit: null,
      required: true,
      media_path: null,
      value: null,
      media_id: null,
      media_path_answer: null,
    },
    {
      id: 'st2',
      seq: 2,
      text: { en: 'Photo after' },
      input_type: 'photo',
      choices: null,
      unit: null,
      required: true,
      media_path: null,
      value: null,
      media_id: null,
      media_path_answer: null,
    },
  ],
  missing: [1, 2],
  photos: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.signedPhoto.mockResolvedValue(null);
});

describe('field app', () => {
  it('My day lists jobs by location with step progress', async () => {
    api.fetchMyDay.mockResolvedValue({
      offline: false,
      data: [
        {
          id: 'w1',
          number: 'WO-1',
          title: 'Bed care',
          status: 'scheduled',
          priority: 'P3',
          wo_type: 'preventive',
          planned_start: null,
          due_at: null,
          location_code: 'EG-01',
          est_minutes: 60,
          mine: true,
          lon: null,
          lat: null,
          steps: 3,
          answered: 1,
          overdue: false,
        },
      ],
    });
    renderAt('/field');
    expect(await screen.findByText('EG-01')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 steps/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Bed care/ })).toHaveAttribute(
      'href',
      '/field/jobs/w1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Map' }));
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  it('runs SOP steps and blocks complete until required steps are done', async () => {
    api.fetchJob.mockResolvedValue({ data: JOB, offline: false });
    api.answerStep.mockResolvedValue(undefined);
    renderAt('/field/jobs/w1');
    expect(await screen.findAllByText(/Weed the bed/)).toHaveLength(2); // step and missing list
    expect(screen.getByText('Still to do before completing:')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Complete job' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(api.answerStep).toHaveBeenCalledWith(JOB, 'st1', { value: true }));
  });

  it('completes once every required step is answered', async () => {
    api.fetchJob.mockResolvedValue({
      offline: false,
      data: {
        ...JOB,
        missing: [],
        steps: JOB.steps.map((s) => ({
          ...s,
          value: s.input_type === 'tick' ? true : null,
          media_id: s.input_type === 'photo' ? 'm1' : null,
        })),
      },
    });
    api.moveJob.mockResolvedValue({});
    renderAt('/field/jobs/w1');
    const btn = await screen.findByRole('button', { name: 'Complete job' });
    await waitFor(() => expect(btn).toBeEnabled());
    fireEvent.click(btn);
    await waitFor(() =>
      expect(api.moveJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'w1' }),
        'completed',
        undefined,
      ),
    );
  });

  it('a scheduled job must be started before steps can be answered', async () => {
    api.fetchJob.mockResolvedValue({ data: { ...JOB, status: 'scheduled' }, offline: false });
    api.moveJob.mockResolvedValue({});
    renderAt('/field/jobs/w1');
    expect(await screen.findByText('Start the job to answer the steps.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    fireEvent.click(await screen.findByRole('button', { name: 'Start job' }));
    await waitFor(() =>
      expect(api.moveJob).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'w1' }),
        'in_progress',
        undefined,
      ),
    );
  });

  it('saves notes, minutes and materials', async () => {
    api.fetchJob.mockResolvedValue({ data: JOB, offline: false });
    api.saveJobRecord.mockResolvedValue(undefined);
    renderAt('/field/jobs/w1');
    fireEvent.change(await screen.findByLabelText('Notes'), { target: { value: 'Weeded' } });
    fireEvent.change(screen.getByLabelText('Minutes worked'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(screen.getByLabelText('Item'), { target: { value: ' mulch ' } });
    fireEvent.change(screen.getByLabelText('Qty'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'm3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save record' }));
    await waitFor(() =>
      expect(api.saveJobRecord).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' }), {
        completion_notes: 'Weeded',
        actual_minutes: 45,
        materials: [{ item: 'mulch', qty: 2, unit: 'm3' }],
      }),
    );
  });

  it('isAnswered follows the database completeness rule', () => {
    expect(isAnswered({ input_type: 'tick', value: false, media_id: null })).toBe(false);
    expect(isAnswered({ input_type: 'tick', value: true, media_id: null })).toBe(true);
    expect(isAnswered({ input_type: 'photo', value: null, media_id: 'm' })).toBe(true);
    expect(isAnswered({ input_type: 'text', value: '', media_id: null })).toBe(false);
    expect(isAnswered({ input_type: 'number', value: 0, media_id: null })).toBe(true);
  });
});
