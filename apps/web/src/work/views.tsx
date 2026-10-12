import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { LeafletMap } from '../components/LeafletMap';
import { PriorityTag, StatusPill, WoFlags } from './badges';
import { ScheduleForm } from './ScheduleForm';
import {
  addDays,
  BOARD_COLUMNS,
  byDay,
  dubaiDate,
  moveToDay,
  STATUS_COLOURS,
  weekStart,
  type BoardItem,
  type WoStatus,
} from './model';

const DRAG_TYPE = 'application/x-terra-wo';

function Card({ item, draggable = true }: { item: BoardItem; draggable?: boolean }) {
  const { t } = useTranslation();
  return (
    <article
      draggable={draggable}
      onDragStart={(e) =>
        e.dataTransfer.setData(
          DRAG_TYPE,
          JSON.stringify({ id: item.id, status: item.status, start: item.planned_start }),
        )
      }
      className="cursor-grab rounded border bg-white p-2 text-xs shadow-sm"
      data-testid={`card-${item.number}`}
    >
      <div className="flex items-center gap-1">
        <PriorityTag priority={item.priority} />
        <Link to={`/work/${item.id}`} className="font-mono text-green-800 underline" dir="ltr">
          {item.number}
        </Link>
      </div>
      <p className="mt-1 font-medium text-gray-900">{item.title}</p>
      <p className="text-gray-600">
        {[item.assignee_name, item.team_name, item.location_code].filter(Boolean).join(' · ') ||
          t('wo.unassigned')}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        <WoFlags item={item} />
      </div>
    </article>
  );
}

function useDrop(onDropItem: (d: { id: string; status: WoStatus; start: string | null }) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e: DragEvent) => {
        if (e.dataTransfer.types.includes(DRAG_TYPE)) {
          e.preventDefault();
          setOver(true);
        }
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const raw = e.dataTransfer.getData(DRAG_TYPE);
        if (raw) onDropItem(JSON.parse(raw));
      },
    },
  };
}

/** Kanban (FR-WO-08). Dropping on a column asks for that transition; the database decides. */
export function BoardView({
  items,
  onTransition,
}: {
  items: BoardItem[];
  onTransition: (id: string, to: WoStatus) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full gap-2 overflow-x-auto pb-2">
      {BOARD_COLUMNS.map((col) => (
        <BoardColumn
          key={col}
          status={col}
          items={items.filter((i) => i.status === col)}
          onDropItem={(d) => d.status !== col && onTransition(d.id, col)}
        >
          <h3 className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: STATUS_COLOURS[col] }}
              />
              {t(`wo.status.${col}`)}
            </span>
            <span className="text-gray-500">{items.filter((i) => i.status === col).length}</span>
          </h3>
        </BoardColumn>
      ))}
    </div>
  );
}

function BoardColumn({
  status,
  items,
  onDropItem,
  children,
}: {
  status: WoStatus;
  items: BoardItem[];
  onDropItem: (d: { id: string; status: WoStatus; start: string | null }) => void;
  children: React.ReactNode;
}) {
  const drop = useDrop(onDropItem);
  return (
    <section
      aria-label={status}
      data-testid={`column-${status}`}
      {...drop.props}
      className={`flex w-56 shrink-0 flex-col rounded bg-gray-100 p-2 ${drop.over ? 'ring-2 ring-green-700' : ''}`}
    >
      {children}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {items.map((i) => (
          <Card key={i.id} item={i} />
        ))}
      </div>
    </section>
  );
}

/** Week calendar (FR-WO-08, 09): drag to another day; move a whole day. */
export function CalendarView({
  items,
  week,
  onWeek,
  onReplan,
  onBulkMove,
}: {
  items: BoardItem[];
  week: string;
  onWeek: (w: string) => void;
  onReplan: (id: string, start: string) => void;
  onBulkMove: (from: string, to: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const grouped = byDay(items);
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${d}T00:00:00Z`));
  const today = dubaiDate(new Date());
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => onWeek(addDays(week, -7))}
          className="rounded border px-2 py-0.5"
        >
          {t('wo.prevWeek')}
        </button>
        <button
          type="button"
          onClick={() => onWeek(weekStart(today))}
          className="rounded border px-2 py-0.5"
        >
          {t('wo.thisWeek')}
        </button>
        <button
          type="button"
          onClick={() => onWeek(addDays(week, 7))}
          className="rounded border px-2 py-0.5"
        >
          {t('wo.nextWeek')}
        </button>
        <span className="ms-2 font-medium">
          {fmt(week)} to {fmt(addDays(week, 6))}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 gap-2 overflow-x-auto">
        {days.map((d) => (
          <CalendarDay
            key={d}
            day={d}
            label={fmt(d)}
            isToday={d === today}
            items={grouped[d] ?? []}
            onDropItem={(x) =>
              x.start && dubaiDate(x.start) !== d && onReplan(x.id, moveToDay(x.start, d))
            }
            onBulkMove={() => {
              const to = window.prompt(t('wo.bulkMovePrompt', { day: fmt(d) }), addDays(d, 1));
              if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) onBulkMove(d, to);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarDay({
  day,
  label,
  isToday,
  items,
  onDropItem,
  onBulkMove,
}: {
  day: string;
  label: string;
  isToday: boolean;
  items: BoardItem[];
  onDropItem: (d: { id: string; status: WoStatus; start: string | null }) => void;
  onBulkMove: () => void;
}) {
  const { t } = useTranslation();
  const drop = useDrop(onDropItem);
  return (
    <section
      aria-label={label}
      data-testid={`day-${day}`}
      {...drop.props}
      className={`flex min-w-36 flex-col rounded p-2 ${isToday ? 'bg-green-50' : 'bg-gray-100'} ${drop.over ? 'ring-2 ring-green-700' : ''}`}
    >
      <h3 className="mb-1 flex items-center justify-between text-xs font-semibold">
        <span>{label}</span>
        <span className="text-gray-500">{items.length}</span>
      </h3>
      {items.length > 0 && (
        <button type="button" onClick={onBulkMove} className="mb-1 self-start text-xs underline">
          {t('wo.bulkMove')}
        </button>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {items.map((i) => (
          <Card
            key={i.id}
            item={i}
            draggable={['requested', 'approved', 'scheduled', 'on_hold'].includes(i.status)}
          />
        ))}
      </div>
    </section>
  );
}

/** Request inbox (FR-WO-06): approve, cancel or schedule. */
export function InboxView({
  items,
  orgId,
  onTransition,
  onChanged,
}: {
  items: BoardItem[];
  orgId: string;
  onTransition: (id: string, to: WoStatus) => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [scheduling, setScheduling] = useState<string | null>(null);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    }).format(new Date(iso));
  if (items.length === 0) return <p className="text-gray-600">{t('wo.inboxEmpty')}</p>;
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.id} className="rounded border p-3 text-sm" data-testid={`request-${i.number}`}>
          <div className="flex flex-wrap items-center gap-2">
            <PriorityTag priority={i.priority} />
            <Link to={`/work/${i.id}`} className="font-mono text-green-800 underline" dir="ltr">
              {i.number}
            </Link>
            <span className="font-medium">{i.title}</span>
            <StatusPill status={i.status} />
            <WoFlags item={i} />
            <span className="ms-auto text-xs text-gray-500">
              {when(i.created_at)}
              {i.location_code ? ` · ${i.location_code}` : ''}
            </span>
          </div>
          {scheduling === i.id ? (
            <div className="mt-2">
              <ScheduleForm
                orgId={orgId}
                woId={i.id}
                onCancel={() => setScheduling(null)}
                onDone={() => {
                  setScheduling(null);
                  onChanged();
                }}
              />
            </div>
          ) : (
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setScheduling(i.id)}
                className="rounded bg-green-800 px-3 py-1 text-white"
              >
                {t('wo.schedule')}
              </button>
              {i.status === 'requested' && (
                <>
                  <button
                    type="button"
                    onClick={() => onTransition(i.id, 'approved')}
                    className="rounded border border-green-800 px-3 py-1 text-green-900"
                  >
                    {t('wo.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onTransition(i.id, 'cancelled')}
                    className="px-2 py-1 text-red-700 underline"
                  >
                    {t('wo.reject')}
                  </button>
                </>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Map of open work coloured by status (FR-WO-08). */
export function WorkMapView({ items }: { items: BoardItem[] }) {
  const { t } = useTranslation();
  const layer = useRef<L.LayerGroup | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const onReady = useCallback((m: L.Map | null) => {
    setMap(m);
    if (!m) return;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
  }, []);
  useEffect(() => {
    const g = layer.current;
    if (!map || !g) return;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const i of items) {
      if (i.lat == null || i.lon == null) continue;
      pts.push([i.lat, i.lon]);
      L.circleMarker([i.lat, i.lon], {
        radius: 7,
        weight: 2,
        color: '#fff',
        fillColor: STATUS_COLOURS[i.status],
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>${i.number}</strong><br>${i.title.replace(/</g, '&lt;')}<br>${t(`wo.status.${i.status}`)}<br><a href="/work/${i.id}">${t('wo.open')}</a>`,
        )
        .addTo(g);
    }
    if (pts.length) map.fitBounds(pts, { maxZoom: 19, padding: [30, 30] });
  }, [map, items, t]);
  return (
    <div className="relative h-full">
      <LeafletMap onReady={onReady} className="h-full w-full rounded border" />
      <ul className="absolute bottom-6 end-2 z-[1000] rounded bg-white/95 p-2 text-xs shadow">
        {BOARD_COLUMNS.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ background: STATUS_COLOURS[s] }}
            />
            {t(`wo.status.${s}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
