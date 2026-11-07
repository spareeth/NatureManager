// Work order view helpers: statuses, colours, Dubai calendar days. Pure functions, tested.

export const WO_STATUSES = [
  'requested',
  'approved',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'verified',
  'closed',
  'cancelled',
] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

/** Kanban columns: the working statuses; closed and cancelled are left off the board. */
export const BOARD_COLUMNS: WoStatus[] = [
  'requested',
  'approved',
  'scheduled',
  'in_progress',
  'on_hold',
  'completed',
  'verified',
];

export const STATUS_COLOURS: Record<WoStatus, string> = {
  requested: '#a855f7',
  approved: '#6366f1',
  scheduled: '#2563eb',
  in_progress: '#f59e0b',
  on_hold: '#9ca3af',
  completed: '#16a34a',
  verified: '#15803d',
  closed: '#334155',
  cancelled: '#d1d5db',
};

export const PRIORITY_COLOURS: Record<string, string> = {
  P1: '#dc2626',
  P2: '#ea580c',
  P3: '#2563eb',
  P4: '#64748b',
};

export const TZ = 'Asia/Dubai';
const DUBAI_OFFSET_MS = 4 * 3600 * 1000; // UTC+4, no daylight saving

/** Calendar date (yyyy-mm-dd) of an instant in Dubai. */
export function dubaiDate(iso: string | Date): string {
  const t = (typeof iso === 'string' ? new Date(iso) : iso).getTime() + DUBAI_OFFSET_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday of the week containing the Dubai date. */
export function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The instant of hh:mm on a Dubai date, as ISO UTC. */
export function dubaiInstant(day: string, hhmm = '07:00'): string {
  return new Date(new Date(`${day}T${hhmm}:00Z`).getTime() - DUBAI_OFFSET_MS).toISOString();
}

/** Keep the Dubai time of day, move to another Dubai date (calendar drag). */
export function moveToDay(iso: string, day: string): string {
  const hhmm = new Date(new Date(iso).getTime() + DUBAI_OFFSET_MS).toISOString().slice(11, 16);
  return dubaiInstant(day, hhmm);
}

export type BoardItem = {
  id: string;
  number: string;
  title: string;
  status: WoStatus;
  priority: string;
  wo_type: string;
  source: string;
  planned_start: string | null;
  planned_end: string | null;
  due_at: string | null;
  created_at: string;
  assignee_name: string | null;
  team_name: string | null;
  location_code: string | null;
  lon: number | null;
  lat: number | null;
  sla_due: string;
  sla_breached: boolean;
  sla_met: boolean;
  overdue: boolean;
};

/** Group board items by Dubai date of their planned start (calendar). */
export function byDay(items: BoardItem[]): Record<string, BoardItem[]> {
  const out: Record<string, BoardItem[]> = {};
  for (const it of items) {
    if (!it.planned_start) continue;
    (out[dubaiDate(it.planned_start)] ??= []).push(it);
  }
  return out;
}
