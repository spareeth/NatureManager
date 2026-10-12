import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n';
import { OrgContext, type OrgState } from '../org/context';
import type { Role } from '../auth/roles';
import { WorkPage } from './WorkPage';
import { WorkOrderPage } from './WorkOrderPage';
import type { BoardItem } from '../work/model';

const api = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  fetchWorkOrder: vi.fn(),
  fetchPeople: vi.fn(),
  fetchAllowed: vi.fn(),
  transition: vi.fn(),
  schedule: vi.fn(),
  replan: vi.fn(),
  bulkMove: vi.fn(),
  raiseRequest: vi.fn(),
}));
vi.mock('../work/api', () => api);
vi.mock('../org/useSite', () => ({
  useCurrentSite: () => ({ site: { id: 's1', code: 'TG', name: 'Terra Garden' } }),
}));
vi.mock('../components/LeafletMap', () => ({ LeafletMap: () => <div data-testid="map" /> }));

const item = (o: Partial<BoardItem>): BoardItem => ({
  id: 'w1',
  number: 'WO-2026-000001',
  title: 'Burst pipe',
  status: 'requested',
  priority: 'P1',
  wo_type: 'reactive',
  source: 'request',
  planned_start: null,
  planned_end: null,
  due_at: null,
  created_at: '2026-10-12T04:00:00Z',
  assignee_name: null,
  team_name: null,
  location_code: 'SG-03',
  lon: null,
  lat: null,
  sla_due: '2026-10-12T08:00:00Z',
  sla_breached: true,
  sla_met: false,
  overdue: false,
  ...o,
});

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
            <Route path="/work" element={<WorkPage />} />
            <Route path="/work/:id" element={<WorkOrderPage />} />
          </Routes>
        </MemoryRouter>
      </OrgContext.Provider>
    </QueryClientProvider>,
  );
}

/** jsdom has no DataTransfer; a minimal one carries the dragged card between events. */
function drag(from: HTMLElement, to: HTMLElement) {
  const store: Record<string, string> = {};
  const dataTransfer = {
    setData: (k: string, v: string) => (store[k] = v),
    getData: (k: string) => store[k] ?? '',
    get types() {
      return Object.keys(store);
    },
  };
  fireEvent(from, Object.assign(createEvent.dragStart(from), { dataTransfer }));
  fireEvent(to, Object.assign(createEvent.dragOver(to), { dataTransfer }));
  fireEvent(to, Object.assign(createEvent.drop(to), { dataTransfer }));
}

beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
  api.transition.mockResolvedValue({});
  api.replan.mockResolvedValue(undefined);
  api.fetchPeople.mockResolvedValue({
    members: [{ user_id: 'u7', name: 'Engineer One', roles: ['field_engineer'], team_id: null }],
    teams: [],
  });
});

describe('work page', () => {
  it('inbox shows requests with SLA flags and approves', async () => {
    api.fetchBoard.mockResolvedValue([item({})]);
    renderAt('/work');
    const req = await screen.findByTestId('request-WO-2026-000001');
    expect(within(req).getByText('SLA breached')).toBeInTheDocument();
    fireEvent.click(within(req).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.transition).toHaveBeenCalledWith('w1', 'approved'));
    expect(await screen.findByRole('status')).toHaveTextContent('Moved to Approved.');
  });

  it('dropping a card on another board column asks for that transition', async () => {
    api.fetchBoard.mockResolvedValue([item({ status: 'scheduled', sla_breached: false })]);
    renderAt('/work?view=board');
    const card = await screen.findByTestId('card-WO-2026-000001');
    expect(
      within(screen.getByTestId('column-scheduled')).getByTestId('card-WO-2026-000001'),
    ).toBeInTheDocument();
    drag(card, screen.getByTestId('column-in_progress'));
    await waitFor(() => expect(api.transition).toHaveBeenCalledWith('w1', 'in_progress'));
  });

  it('a refused transition is shown, not hidden', async () => {
    api.fetchBoard.mockResolvedValue([item({ status: 'scheduled', sla_breached: false })]);
    api.transition.mockRejectedValueOnce(
      new Error('transition scheduled -> verified is not allowed'),
    );
    renderAt('/work?view=board');
    drag(await screen.findByTestId('card-WO-2026-000001'), screen.getByTestId('column-verified'));
    expect(await screen.findByRole('alert')).toHaveTextContent('not allowed');
  });

  it('dragging on the calendar keeps the time of day on the new date', async () => {
    api.fetchBoard.mockResolvedValue([
      item({ status: 'scheduled', planned_start: '2026-10-12T03:00:00.000Z', sla_breached: false }),
    ]);
    renderAt('/work?view=calendar&week=2026-10-12');
    const card = await screen.findByTestId('card-WO-2026-000001');
    expect(
      within(screen.getByTestId('day-2026-10-12')).getByTestId('card-WO-2026-000001'),
    ).toBeInTheDocument();
    drag(card, screen.getByTestId('day-2026-10-14'));
    await waitFor(() => expect(api.replan).toHaveBeenCalledWith('w1', '2026-10-14T03:00:00.000Z'));
    expect(api.fetchBoard).toHaveBeenCalledWith('s1', {
      from: '2026-10-11T20:00:00.000Z',
      to: '2026-10-18T20:00:00.000Z',
    });
  });

  it('green team sees open requests and can report a problem, no planner views', async () => {
    api.fetchBoard.mockResolvedValue([item({})]);
    api.raiseRequest.mockResolvedValue({ id: 'w9', number: 'WO-2026-000009' });
    renderAt('/work', ['green_team']);
    await screen.findByTestId('request-WO-2026-000001');
    expect(screen.queryByRole('button', { name: 'Board' })).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Report a problem' })[0]!);
    const form = screen.getByRole('form', { name: 'Report a problem' });
    fireEvent.click(within(form).getByRole('button', { name: 'Send request' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Say briefly what is wrong.');
    fireEvent.change(within(form).getByLabelText('What is wrong?'), {
      target: { value: 'Sprinkler stuck on in WG-07' },
    });
    fireEvent.change(within(form).getByLabelText('Urgency'), { target: { value: 'P2' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Send request' }));
    await waitFor(() =>
      expect(api.raiseRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'o1',
          siteId: 's1',
          title: 'Sprinkler stuck on in WG-07',
          priority: 'P2',
        }),
      ),
    );
  });
});

describe('work order page', () => {
  const detail = {
    id: 'w1',
    number: 'WO-2026-000001',
    title: 'Bed care · NG-01',
    description: null,
    status: 'completed',
    priority: 'P3',
    wo_type: 'preventive',
    source: 'pm',
    site_id: 's1',
    planned_start: '2026-10-12T03:00:00Z',
    planned_end: null,
    due_at: null,
    est_minutes: 45,
    actual_minutes: 40,
    materials: [],
    completion_notes: 'Weeded',
    created_at: '2026-10-11T20:30:00Z',
    created_by_name: null,
    assignee_user_id: null,
    assignee_name: null,
    team_id: 't1',
    team_name: 'Green Team East',
    location: { id: 'l1', code: 'NG-01' },
    sop: { id: 's', code: 'SOP-BED', version: 2, title: { en: 'Bed care' } },
    template_code: 'PM-BED-CARE',
    lon: null,
    lat: null,
    sla_due: '2026-10-14T20:30:00Z',
    assets: [],
    events: [
      {
        at: '2026-10-12T05:00:00Z',
        from: 'in_progress',
        to: 'completed',
        note: 'done',
        source: 'user',
        by: 'Green One',
      },
    ],
  };

  it('shows only the allowed actions; failing verification asks for a reason', async () => {
    api.fetchWorkOrder.mockResolvedValue(detail);
    api.fetchAllowed.mockResolvedValue([
      { to_status: 'in_progress', note_required: true },
      { to_status: 'verified', note_required: false },
    ]);
    renderAt('/work/w1', ['field_manager']);
    expect(await screen.findByText('SOP-BED v2 · Bed care')).toBeInTheDocument();
    expect(screen.getByTestId('wo-history')).toHaveTextContent('In progress to Completed: done');
    fireEvent.click(await screen.findByRole('button', { name: 'Fail verification' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Mulch missing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() =>
      expect(api.transition).toHaveBeenCalledWith('w1', 'in_progress', 'Mulch missing'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(api.transition).toHaveBeenCalledWith('w1', 'verified', undefined));
  });
});
