import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { photoUrl } from './photos';
import { useOutbox } from '../offline/outbox';
import { applyPending, fieldMoves } from '../offline/overlay';
import { PriorityTag, StatusPill } from '../work/badges';
import type { WoStatus } from '../work/model';
import {
  answerStep,
  fetchJob,
  isAnswered,
  NotOffline,
  moveJob,
  saveJobRecord,
  addJobPhoto,
  signedPhoto,
  type Bilingual,
  type FieldJob,
  type JobStep,
  type Material,
} from './api';

const BTN = 'min-h-12 rounded-lg px-4 text-lg font-semibold';

/** One job on the phone: start, SOP runner, photos, notes, materials, complete (FR-FLD-03). */
export function JobScreen() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { current } = useOrg();
  const queryClient = useQueryClient();
  const job = useQuery({ queryKey: ['field-job', id], queryFn: () => fetchJob(id!) });
  const outbox = useOutbox();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const loc = (x: Bilingual | null | undefined) =>
    x ? (i18n.language.startsWith('ar') && x.ar) || x.en : '';

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['field-job', id] }),
      queryClient.invalidateQueries({ queryKey: ['field-day'] }),
    ]);
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      if (ok) setMessage({ kind: 'ok', text: ok });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  if (job.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (job.error)
    return (
      <p role="alert" className="p-4 text-red-700">
        {job.error instanceof NotOffline ? t('fieldApp.notOffline') : job.error.message}
      </p>
    );
  if (!job.data.data) return <p className="p-4">{t('fieldApp.notFound')}</p>;

  // The last known copy with the changes still waiting to sync applied on top.
  const j = applyPending(job.data.data, outbox);
  const planner = !!current?.roles.some((r) => r === 'manager' || r === 'field_manager');
  const fieldManager = !!current?.roles.includes('field_manager');
  const canWork = j.status === 'in_progress' && (j.mine || planner);
  const canRecord = (j.mine || planner) && ['in_progress', 'on_hold'].includes(j.status);
  const moves = fieldMoves(j.status, j.mine, fieldManager).map((to) => ({
    to_status: to,
    note_required: false,
  }));
  const missing = j.steps.filter((s) => j.missing.includes(s.seq));
  // A failed verification (completed back to in progress) and its reason, while the job is reopened.
  const last = j.events[0];
  const sentBack =
    j.status === 'in_progress' && last?.from === 'completed' && last.to === 'in_progress'
      ? last
      : null;

  const move = (to: WoStatus, noteRequired: boolean) => {
    let note: string | undefined;
    if (noteRequired || to === 'on_hold') {
      note = window.prompt(t('fieldApp.reason')) ?? undefined;
      if (noteRequired && !note) return;
    }
    void run(
      () => moveJob(j, to, note),
      t('fieldApp.queuedMove', { status: t(`wo.status.${to}`) }),
    );
  };

  return (
    <section className="mx-auto max-w-xl space-y-4 p-3 pb-24 text-base">
      <Link to="/field" className="inline-flex min-h-12 items-center text-green-900 underline">
        ‹ {t('fieldApp.myDay')}
      </Link>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold">{j.location?.code ?? '-'}</span>
          <PriorityTag priority={j.priority} />
          <StatusPill status={j.status} />
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{j.title}</h1>
        <p className="text-sm text-gray-700">
          {j.number}
          {j.assets.length > 0 && ` · ${j.assets.map((a) => a.tag_code).join(', ')}`}
        </p>
        {j.description && <p className="mt-2 whitespace-pre-line">{j.description}</p>}
      </header>

      {sentBack && (
        <p role="note" className="rounded border-2 border-red-700 bg-red-50 p-2 text-red-900">
          <strong>{t('fieldApp.sentBack', { name: sentBack.by ?? '-' })}</strong> {sentBack.note}
        </p>
      )}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded p-2 ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}
        >
          {message.text}
        </p>
      )}

      {moves.some((m) => m.to_status === 'in_progress') && (
        <button
          type="button"
          disabled={busy}
          onClick={() => move('in_progress', false)}
          className={`${BTN} w-full bg-green-800 text-white disabled:opacity-50`}
        >
          {j.status === 'on_hold' ? t('fieldApp.resume') : t('fieldApp.start')}
        </button>
      )}

      {j.sop && (
        <section aria-labelledby="sop-h" className="rounded-lg border-2 p-3">
          <h2 id="sop-h" className="text-lg font-semibold">
            {loc(j.sop.title)}{' '}
            <span className="text-sm font-normal text-gray-600">
              {j.sop.code} v{j.sop.version}
            </span>
          </h2>
          {!!j.sop.ppe?.length && (
            <p className="mt-1">
              <strong>{t('fieldApp.ppe')}:</strong> {j.sop.ppe.join(', ')}
            </p>
          )}
          {!!j.sop.hazards?.length && (
            <p className="mt-1 text-amber-900">
              <strong>{t('fieldApp.hazards')}:</strong> {j.sop.hazards.join(', ')}
            </p>
          )}
          {!canWork && j.status !== 'completed' && (
            <p className="mt-2 text-sm text-gray-700">{t('fieldApp.startFirst')}</p>
          )}
          <ol className="mt-3 space-y-3">
            {j.steps.map((s) => (
              <StepRow
                key={s.id}
                step={s}
                label={loc(s.text)}
                disabled={!canWork || busy}
                onAnswer={(a) => run(() => answerStep(j, s.id, a))}
                onPhoto={(file) =>
                  run(async () => {
                    const mediaId = await addJobPhoto(j, file, loc(s.text));
                    await answerStep(j, s.id, { mediaId });
                  })
                }
              />
            ))}
          </ol>
        </section>
      )}

      <Photos job={j} disabled={!canRecord || busy} onAdd={(f) => run(() => addJobPhoto(j, f))} />
      <RecordForm
        key={`${j.id}-${j.status}`}
        job={j}
        disabled={!canRecord || busy}
        onSave={(v) => run(() => saveJobRecord(j, v), t('fieldApp.saved'))}
      />

      {moves.some((m) => m.to_status === 'completed') && missing.length > 0 && (
        <div role="note" className="rounded bg-amber-50 p-2 text-amber-900">
          <p className="font-semibold">{t('fieldApp.missing')}</p>
          <ul className="list-disc ps-5">
            {missing.map((s) => (
              <li key={s.id}>
                {s.seq}. {loc(s.text)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {moves
          .filter((m) => m.to_status !== 'in_progress')
          .map((m) => (
            <button
              key={m.to_status}
              type="button"
              disabled={busy || (m.to_status === 'completed' && missing.length > 0)}
              onClick={() => move(m.to_status, m.note_required)}
              className={`${BTN} flex-1 disabled:opacity-50 ${m.to_status === 'completed' ? 'bg-green-800 text-white' : 'border-2'}`}
            >
              {m.to_status === 'completed' ? t('fieldApp.complete') : t('fieldApp.hold')}
            </button>
          ))}
      </div>
    </section>
  );
}

function StepRow({
  step,
  label,
  disabled,
  onAnswer,
  onPhoto,
}: {
  step: JobStep;
  label: string;
  disabled: boolean;
  onAnswer: (a: { value: string | number | boolean | null }) => void;
  onPhoto: (f: File) => void;
}) {
  const { t } = useTranslation();
  // Ticks and choices show at once; the saved answer replaces this when the job reloads.
  const [picked, setPicked] = useState<string | boolean | null | undefined>(undefined);
  const value = picked !== undefined ? picked : step.value;
  const answer = (v: string | boolean) => {
    setPicked(v);
    onAnswer({ value: v });
  };
  const done = isAnswered({ ...step, value });
  const [draft, setDraft] = useState(step.value == null ? '' : String(step.value));
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (step.blobId || step.media_path_answer)
      void photoUrl(step.media_path_answer, step.blobId).then((u) => live && setThumb(u));
    return () => {
      live = false;
    };
  }, [step.media_path_answer, step.blobId]);
  const [guide, setGuide] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (step.media_path)
      void signedPhoto('sop-media', step.media_path).then((u) => live && setGuide(u));
    return () => {
      live = false;
    };
  }, [step.media_path]);

  return (
    <li
      className={`rounded border-2 p-2 ${done ? 'border-green-700 bg-green-50' : 'border-gray-300'}`}
    >
      <p className="font-medium">
        {step.seq}. {label}
        {step.required && <span className="text-red-700"> *</span>}
        {done && <span className="sr-only"> ({t('fieldApp.done')})</span>}
      </p>
      {guide && <img src={guide} alt="" className="mt-1 max-h-40 rounded" />}
      <div className="mt-2">
        {step.input_type === 'tick' && (
          <label className="flex min-h-12 items-center gap-3">
            <input
              type="checkbox"
              className="h-8 w-8"
              checked={value === true}
              disabled={disabled}
              onChange={(e) => answer(e.target.checked)}
            />
            {t('fieldApp.doneTick')}
          </label>
        )}
        {(step.input_type === 'number' || step.input_type === 'text') && (
          <div className="flex gap-2">
            <input
              aria-label={label}
              type={step.input_type === 'number' ? 'number' : 'text'}
              inputMode={step.input_type === 'number' ? 'decimal' : undefined}
              className="min-h-12 flex-1 rounded border-2 px-2 text-lg"
              value={draft}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
            />
            {step.unit && <span className="self-center">{step.unit}</span>}
            <button
              type="button"
              disabled={disabled || draft === String(step.value ?? '')}
              onClick={() =>
                onAnswer({
                  value: draft === '' ? null : step.input_type === 'number' ? Number(draft) : draft,
                })
              }
              className={`${BTN} border-2 disabled:opacity-50`}
            >
              {t('fieldApp.save')}
            </button>
          </div>
        )}
        {step.input_type === 'choice' && (
          <div className="flex flex-wrap gap-2">
            {(step.choices ?? []).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={value === c}
                disabled={disabled}
                onClick={() => answer(c)}
                className={`${BTN} ${value === c ? 'bg-green-800 text-white' : 'border-2'} disabled:opacity-50`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        {step.input_type === 'photo' && (
          <div className="flex items-center gap-3">
            {thumb && <img src={thumb} alt={label} className="h-20 w-20 rounded object-cover" />}
            <PhotoButton
              disabled={disabled}
              label={done ? t('fieldApp.retake') : t('fieldApp.takePhoto')}
              onFile={onPhoto}
            />
          </div>
        )}
      </div>
    </li>
  );
}

function PhotoButton({
  disabled,
  label,
  onFile,
}: {
  disabled: boolean;
  label: string;
  onFile: (f: File) => void;
}) {
  return (
    <label
      className={`${BTN} inline-flex cursor-pointer items-center border-2 ${disabled ? 'pointer-events-none opacity-50' : ''}`}
    >
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function Photos({
  job,
  disabled,
  onAdd,
}: {
  job: FieldJob;
  disabled: boolean;
  onAdd: (f: File) => void;
}) {
  const { t } = useTranslation();
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(
      job.photos.map(async (p) => [p.id, await photoUrl(p.path, p.blobId)] as const),
    ).then((pairs) => {
      if (live) setUrls(Object.fromEntries(pairs.filter((x): x is [string, string] => !!x[1])));
    });
    return () => {
      live = false;
    };
  }, [job.photos]);
  return (
    <section aria-labelledby="photos-h" className="rounded-lg border-2 p-3">
      <h2 id="photos-h" className="text-lg font-semibold">
        {t('fieldApp.photos')} ({job.photos.length})
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {job.photos.map((p) =>
          urls[p.id] ? (
            <img
              key={p.id}
              src={urls[p.id]}
              alt={p.caption ?? ''}
              className="h-20 w-20 rounded object-cover"
            />
          ) : null,
        )}
      </div>
      <div className="mt-2">
        <PhotoButton disabled={disabled} label={t('fieldApp.addPhoto')} onFile={onAdd} />
      </div>
    </section>
  );
}

function RecordForm({
  job,
  disabled,
  onSave,
}: {
  job: FieldJob;
  disabled: boolean;
  onSave: (v: {
    completion_notes: string | null;
    actual_minutes: number | null;
    materials: Material[];
  }) => void;
}) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState(job.completion_notes ?? '');
  const [minutes, setMinutes] = useState(job.actual_minutes?.toString() ?? '');
  const [materials, setMaterials] = useState<Material[]>(job.materials ?? []);
  const setLine = (i: number, patch: Partial<Material>) =>
    setMaterials((m) => m.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <section aria-labelledby="record-h" className="space-y-3 rounded-lg border-2 p-3">
      <h2 id="record-h" className="text-lg font-semibold">
        {t('fieldApp.record')}
      </h2>
      <label className="block">
        {t('fieldApp.notes')}
        <textarea
          className="mt-1 block min-h-24 w-full rounded border-2 p-2 text-lg"
          value={notes}
          disabled={disabled}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label className="block">
        {t('fieldApp.minutes')}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          className="mt-1 block min-h-12 w-32 rounded border-2 px-2 text-lg"
          value={minutes}
          disabled={disabled}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </label>
      <fieldset>
        <legend>{t('fieldApp.materials')}</legend>
        {materials.map((m, i) => (
          <div key={i} className="mt-2 flex flex-wrap gap-2">
            <input
              aria-label={t('fieldApp.item')}
              placeholder={t('fieldApp.item')}
              className="min-h-12 min-w-0 basis-full rounded border-2 px-2"
              value={m.item}
              disabled={disabled}
              onChange={(e) => setLine(i, { item: e.target.value })}
            />
            <input
              aria-label={t('fieldApp.qty')}
              placeholder={t('fieldApp.qty')}
              type="number"
              inputMode="decimal"
              className="min-h-12 w-24 flex-1 rounded border-2 px-2"
              value={m.qty ?? ''}
              disabled={disabled}
              onChange={(e) =>
                setLine(i, { qty: e.target.value === '' ? undefined : Number(e.target.value) })
              }
            />
            <input
              aria-label={t('fieldApp.unit')}
              placeholder={t('fieldApp.unit')}
              className="min-h-12 w-24 flex-1 rounded border-2 px-2"
              value={m.unit ?? ''}
              disabled={disabled}
              onChange={(e) => setLine(i, { unit: e.target.value || undefined })}
            />
            <button
              type="button"
              aria-label={t('fieldApp.removeItem')}
              disabled={disabled}
              onClick={() => setMaterials((x) => x.filter((_, k) => k !== i))}
              className="min-h-12 min-w-12 rounded border-2"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMaterials((x) => [...x, { item: '' }])}
          className={`${BTN} mt-2 border-2 disabled:opacity-50`}
        >
          {t('fieldApp.addItem')}
        </button>
      </fieldset>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          onSave({
            completion_notes: notes.trim() || null,
            actual_minutes: minutes === '' ? null : Math.round(Number(minutes)),
            materials: materials
              .filter((m) => m.item.trim())
              .map((m) => ({ ...m, item: m.item.trim() })),
          })
        }
        className={`${BTN} w-full bg-green-800 text-white disabled:opacity-50`}
      >
        {t('fieldApp.saveRecord')}
      </button>
    </section>
  );
}
