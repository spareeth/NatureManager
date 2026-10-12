import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { fetchPeople, schedule } from './api';
import { addDays, dubaiDate, dubaiInstant } from './model';

type Props = {
  orgId: string;
  woId: string;
  defaultTeam?: string | null;
  onDone: () => void;
  onCancel: () => void;
};

/** Assign a person or team and a start; approves a request first (wo_schedule). */
export function ScheduleForm({ orgId, woId, defaultTeam, onDone, onCancel }: Props) {
  const { t } = useTranslation();
  const people = useQuery({ queryKey: ['wo-people', orgId], queryFn: () => fetchPeople(orgId) });
  const [assignee, setAssignee] = useState('');
  const [team, setTeam] = useState(defaultTeam ?? '');
  const [day, setDay] = useState(addDays(dubaiDate(new Date()), 1));
  const [time, setTime] = useState('07:00');
  const [minutes, setMinutes] = useState('60');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!assignee && !team) return setError(t('wo.assignRequired'));
    setBusy(true);
    try {
      await schedule(woId, {
        assignee: assignee || null,
        team: team || null,
        start: dubaiInstant(day, time),
        minutes: Number(minutes) || null,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const input = 'w-full rounded border border-gray-300 px-2 py-1';
  return (
    <form
      onSubmit={submit}
      aria-label={t('wo.scheduleTitle')}
      className="grid gap-2 rounded border bg-gray-50 p-3 text-sm sm:grid-cols-2"
    >
      <label>
        {t('wo.assignee')}
        <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={input}>
          <option value="" />
          {(people.data?.members ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('wo.team')}
        <select value={team} onChange={(e) => setTeam(e.target.value)} className={input}>
          <option value="" />
          {(people.data?.teams ?? []).map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('wo.day')}
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={input} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          {t('wo.time')}
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={input}
          />
        </label>
        <label>
          {t('wo.minutes')}
          <input
            inputMode="numeric"
            dir="ltr"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className={input}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-red-700 sm:col-span-2">
          {error}
        </p>
      )}
      <div className="flex gap-3 sm:col-span-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-green-800 px-3 py-1 font-medium text-white disabled:opacity-60"
        >
          {t('wo.schedule')}
        </button>
        <button type="button" onClick={onCancel} className="underline">
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
