import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { PlanPage } from './PlanPage';
import { SopEditorPage } from './SopEditorPage';

const api = vi.hoisted(() => ({
  fetchLibrary: vi.fn(),
  fetchSop: vi.fn(),
  createSop: vi.fn(),
  updateSop: vi.fn(),
  saveStep: vi.fn(),
  deleteStep: vi.fn(),
  reorderSteps: vi.fn(),
  newVersion: vi.fn(),
  approveSop: vi.fn(),
  deleteDraft: vi.fn(),
  uploadStepImage: vi.fn(),
  signedStepImage: vi.fn(),
  fetchTemplates: vi.fn(),
  saveTemplate: vi.fn(),
  fetchSchedules: vi.fn(),
  saveSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  generateNow: vi.fn(),
  fetchPickLists: vi.fn(),
}));
vi.mock('../plan/api', () => api);
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));

function renderAt(path: string, roles: Role[] = ['manager']) {
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
      displayName: 'M',
    },
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <OrgContext.Provider value={org}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/plan/sops/:id" element={<SopEditorPage />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

const SOP = {
  id: 'v1',
  organisation_id: 'o1',
  code: 'SOP-BED',
  version: 1,
  title: { en: 'Bed care', ar: 'العناية بالحوض' },
  purpose: null,
  ppe: ['gloves'],
  hazards: [],
  approved_at: null,
};
const STEPS = [
  {
    id: 's1',
    sop_id: 'v1',
    seq: 1,
    text: { en: 'Weed the bed' },
    input_type: 'tick',
    choices: null,
    unit: null,
    required: true,
    media_path: null,
  },
  {
    id: 's2',
    sop_id: 'v1',
    seq: 2,
    text: { en: 'Mulch depth' },
    input_type: 'number',
    choices: null,
    unit: 'cm',
    required: false,
    media_path: null,
  },
];

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.fetchPickLists.mockResolvedValue({
    locations: [
      { id: 'z-ng', code: 'NG', kind: 'zone' },
      { id: 'b-ng1', code: 'NG-01', kind: 'bed' },
    ],
    types: [{ id: 'tree', code: 'TREE', name: 'Tree', name_ar: 'شجرة' }],
    teams: [{ id: 'east', name: 'Green Team East' }],
    sops: [
      { id: 'v1', code: 'SOP-BED', version: 1, status: 'approved', title: { en: 'Bed care' } },
    ],
  });
  api.fetchTemplates.mockResolvedValue([
    {
      id: 't1',
      code: 'PM-BED-CARE',
      title: 'Bed care',
      wo_type: 'preventive',
      default_priority: 'P3',
      sop_id: 'v1',
      team_id: 'east',
      est_minutes: 45,
    },
  ]);
  api.fetchSchedules.mockResolvedValue([]);
  api.saveSchedule.mockResolvedValue({ id: 'x' });
  api.generateNow.mockResolvedValue({ created: 15, existing: 0, over_capacity: 0, schedules: 1 });
});

describe('SOP editor', () => {
  it('a draft is editable: add a step, reorder, approve', async () => {
    api.fetchSop.mockResolvedValue({ sop: { ...SOP, status: 'draft' }, steps: STEPS });
    api.saveStep.mockResolvedValue({ id: 's3' });
    api.approveSop.mockResolvedValue(null);
    renderAt('/plan/sops/v1');
    expect(await screen.findByText('SOP-BED v1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));
    const form = screen.getByRole('form', { name: 'Step' });
    fireEvent.change(within(form).getByLabelText('Answer type'), { target: { value: 'choice' } });
    fireEvent.change(within(form).getByLabelText('Step (English)'), {
      target: { value: 'Pest seen?' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Give at least one choice.');
    fireEvent.change(within(form).getByLabelText('Choices (comma separated)'), {
      target: { value: 'none, scale insects, aphids' },
    });
    fireEvent.change(within(form).getByLabelText('Step (Arabic)'), {
      target: { value: 'هل توجد آفات؟' },
    });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveStep).toHaveBeenCalledWith(
        'o1',
        'v1',
        expect.objectContaining({
          seq: 3,
          input_type: 'choice',
          choices: ['none', 'scale insects', 'aphids'],
          text: { en: 'Pest seen?', ar: 'هل توجد آفات؟' },
        }),
      ),
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!);
    await waitFor(() => expect(api.reorderSteps).toHaveBeenCalledWith('v1', ['s2', 's1']));
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.approveSop).toHaveBeenCalledWith('v1'));
  });

  it('an approved version is read-only and offers a new version', async () => {
    api.fetchSop.mockResolvedValue({
      sop: { ...SOP, status: 'approved', approved_at: '2026-10-12T05:00:00Z' },
      steps: STEPS,
    });
    renderAt('/plan/sops/v1');
    expect(await screen.findByText(/cannot change/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add step' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title (English)')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New version' })).toBeInTheDocument();
  });

  it('a field manager reads but cannot change', async () => {
    api.fetchSop.mockResolvedValue({ sop: { ...SOP, status: 'draft' }, steps: STEPS });
    renderAt('/plan/sops/v1', ['field_manager']);
    await screen.findByText('SOP-BED v1');
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add step' })).not.toBeInTheDocument();
  });
});

describe('PM schedules', () => {
  it('builds the weekly each-bed rule and saves it, then generates', async () => {
    renderAt('/plan?tab=schedules');
    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }));
    const form = screen.getByRole('form', { name: 'PM schedule' });
    await within(form).findByRole('option', { name: 'PM-BED-CARE · Bed care' });
    fireEvent.change(within(form).getByLabelText('Template'), { target: { value: 't1' } });
    fireEvent.change(within(form).getByLabelText('Location'), { target: { value: 'z-ng' } });
    expect(within(form).getByTestId('rule-summary')).toHaveTextContent(
      'Every week on Mon, Tue, Wed, Thu, Fri; each bed',
    );
    fireEvent.click(within(form).getByLabelText('Fri'));
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.saveSchedule).toHaveBeenCalledWith(
        'o1',
        expect.objectContaining({
          template_id: 't1',
          target_kind: 'location',
          target_location_id: 'z-ng',
          max_per_day: 10,
          horizon_days: 14,
          rule: { freq: 'weekly', byweekday: [0, 1, 2, 3], each: 'bed' },
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate now' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Created 15 work orders');
  });

  it('refuses a schedule without a location', async () => {
    renderAt('/plan?tab=schedules');
    fireEvent.click(await screen.findByRole('button', { name: 'New schedule' }));
    const form = screen.getByRole('form', { name: 'PM schedule' });
    fireEvent.change(within(form).getByLabelText('Template'), { target: { value: 't1' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a template and a location');
    expect(api.saveSchedule).not.toHaveBeenCalled();
  });
});
