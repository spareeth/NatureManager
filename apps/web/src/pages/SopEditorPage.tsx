import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import {
  approveSop,
  deleteDraft,
  deleteStep,
  fetchSop,
  newVersion,
  reorderSteps,
  saveStep,
  signedStepImage,
  updateSop,
  uploadStepImage,
  type I18nText,
  type Sop,
  type Step,
} from '../plan/api';

const input = 'w-full rounded border border-gray-300 px-2 py-1';
const TYPES: Step['input_type'][] = ['tick', 'number', 'text', 'photo', 'choice'];
const list = (s: string) =>
  s
    .split(/[,،;؛\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

type StepDraft = Omit<Step, 'id' | 'sop_id'> & { id?: string };

/** SOP version editor (FR-SOP-01, 04, 05). Drafts are editable by managers; approved versions are read-only. */
export function SopEditorPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { current } = useOrg();
  const data = useQuery({ queryKey: ['sop', id], enabled: !!id, queryFn: () => fetchSop(id!) });
  const [step, setStep] = useState<StepDraft | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const sop = data.data?.sop;
  const steps = data.data?.steps ?? [];
  const isManager = !!current?.roles.includes('manager');
  const editable = isManager && sop?.status === 'draft';

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['sop'] });
    await qc.invalidateQueries({ queryKey: ['sop-library'] });
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMessage(null);
    try {
      await fn();
      setMessage({ kind: 'ok', text: ok });
      await refresh();
      return true;
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
      return false;
    }
  };

  if (data.isPending) return <p className="p-4">{t('common.loading')}</p>;
  if (!sop || !current) return <p className="p-4">{t('plan.sopNotFound')}</p>;
  const tx = (x: I18nText | null | undefined) =>
    x ? (i18n.language.startsWith('ar') && x.ar) || x.en : '';

  async function saveStepDraft(e: FormEvent) {
    e.preventDefault();
    if (!step) return;
    if (!step.text.en.trim())
      return setMessage({ kind: 'error', text: t('plan.stepTextRequired') });
    if (step.input_type === 'choice' && !(step.choices ?? []).length)
      return setMessage({ kind: 'error', text: t('plan.choicesRequired') });
    const ok = await run(
      () =>
        saveStep(current!.organisationId, sop!.id, {
          ...step,
          text: {
            en: step.text.en.trim(),
            ...(step.text.ar?.trim() ? { ar: step.text.ar.trim() } : {}),
          },
        }),
      t('plan.saved'),
    );
    if (ok) setStep(null);
  }
  const move = (i: number, d: -1 | 1) => {
    const ids = steps.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => reorderSteps(sop!.id, ids), t('plan.reordered'));
  };

  return (
    <section className="mx-auto max-w-4xl p-4">
      <Link to="/plan?tab=sops" className="text-sm underline">
        {t('plan.back')}
      </Link>
      <header className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold" dir="ltr">
          {sop.code} v{sop.version}
        </h1>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${sop.status === 'approved' ? 'bg-green-100 text-green-900' : sop.status === 'draft' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'}`}
        >
          {t(`plan.status.${sop.status}`)}
        </span>
        <span className="text-lg">{tx(sop.title)}</span>
        <span className="ms-auto flex gap-2 text-sm">
          {isManager && sop.status === 'draft' && (
            <>
              <button
                type="button"
                onClick={() => void run(() => approveSop(sop.id), t('plan.approved'))}
                className="rounded bg-green-800 px-3 py-1 text-white"
              >
                {t('plan.approve')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (
                    window.confirm(t('plan.confirmDeleteDraft')) &&
                    (await run(() => deleteDraft(sop.id), t('plan.deleted')))
                  )
                    navigate('/plan?tab=sops');
                }}
                className="text-red-700 underline"
              >
                {t('plan.deleteDraft')}
              </button>
            </>
          )}
          {isManager && sop.status === 'approved' && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const nid = await newVersion(sop.id);
                  await refresh();
                  navigate(`/plan/sops/${nid}`);
                } catch (e) {
                  setMessage({ kind: 'error', text: (e as Error).message });
                }
              }}
              className="rounded border border-green-800 px-3 py-1 text-green-900"
            >
              {t('plan.newVersion')}
            </button>
          )}
        </span>
      </header>
      {sop.status !== 'draft' && (
        <p className="mt-2 text-sm text-gray-600">{t('plan.readOnlyVersion')}</p>
      )}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mt-2 rounded px-2 py-1 text-sm ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}
        >
          {message.text}
        </p>
      )}

      <SopHeaderForm
        key={sop.id}
        sop={sop}
        editable={editable}
        onSave={(v) => run(() => updateSop(sop.id, v), t('plan.saved'))}
        onInvalid={(text) => setMessage({ kind: 'error', text })}
      />

      <h2 className="mt-6 font-semibold">{t('plan.stepsTitle')}</h2>
      <ol className="mt-2 space-y-2" data-testid="sop-steps">
        {steps.map((s, i) => (
          <li key={s.id} className="rounded border p-2 text-sm">
            <div className="flex flex-wrap items-start gap-2">
              <span className="font-mono text-gray-500">{s.seq}.</span>
              <div className="min-w-0 flex-1">
                <p>
                  {s.text.en}
                  {s.required && (
                    <span className="ms-1 text-red-700" title={t('plan.required')}>
                      *
                    </span>
                  )}
                </p>
                {s.text.ar && (
                  <p dir="rtl" lang="ar" className="text-gray-700">
                    {s.text.ar}
                  </p>
                )}
                <p className="text-xs text-gray-500">
                  {t(`plan.input.${s.input_type}`)}
                  {s.unit ? ` (${s.unit})` : ''}
                  {s.choices?.length ? `: ${s.choices.join(' / ')}` : ''}
                </p>
                {s.media_path && <StepImage path={s.media_path} />}
              </div>
              {editable && (
                <span className="flex gap-2 text-xs">
                  <button
                    type="button"
                    aria-label={t('plan.moveUp')}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    aria-label={t('plan.moveDown')}
                    disabled={i === steps.length - 1}
                    onClick={() => move(i, 1)}
                    className="disabled:opacity-30"
                  >
                    ▼
                  </button>
                  <button type="button" onClick={() => setStep({ ...s })} className="underline">
                    {t('edit.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void run(() => deleteStep(s.id), t('plan.deleted'))}
                    className="text-red-700 underline"
                  >
                    {t('cp.delete')}
                  </button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {editable && !step && (
        <button
          type="button"
          className="mt-3 rounded border border-green-800 px-3 py-1 text-sm text-green-900"
          onClick={() =>
            setStep({
              seq: (steps.at(-1)?.seq ?? 0) + 1,
              text: { en: '' },
              input_type: 'tick',
              choices: null,
              unit: null,
              required: true,
              media_path: null,
            })
          }
        >
          {t('plan.addStep')}
        </button>
      )}
      {step && editable && (
        <form
          onSubmit={saveStepDraft}
          aria-label={t('plan.stepForm')}
          className="mt-3 grid gap-2 rounded border bg-gray-50 p-3 text-sm sm:grid-cols-2"
        >
          <label>
            {t('plan.stepEn')}
            <textarea
              rows={2}
              value={step.text.en}
              onChange={(e) => setStep({ ...step, text: { ...step.text, en: e.target.value } })}
              className={input}
            />
          </label>
          <label>
            {t('plan.stepAr')}
            <textarea
              dir="rtl"
              lang="ar"
              rows={2}
              value={step.text.ar ?? ''}
              onChange={(e) => setStep({ ...step, text: { ...step.text, ar: e.target.value } })}
              className={input}
            />
          </label>
          <label>
            {t('plan.inputType')}
            <select
              value={step.input_type}
              onChange={(e) =>
                setStep({ ...step, input_type: e.target.value as Step['input_type'] })
              }
              className={input}
            >
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(`plan.input.${x}`)}
                </option>
              ))}
            </select>
          </label>
          {step.input_type === 'number' && (
            <label>
              {t('plan.unit')}
              <input
                value={step.unit ?? ''}
                onChange={(e) => setStep({ ...step, unit: e.target.value || null })}
                className={input}
              />
            </label>
          )}
          {step.input_type === 'choice' && (
            <label>
              {t('plan.choices')}
              <input
                value={(step.choices ?? []).join(', ')}
                onChange={(e) => setStep({ ...step, choices: list(e.target.value) })}
                className={input}
              />
            </label>
          )}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={step.required}
              onChange={(e) => setStep({ ...step, required: e.target.checked })}
            />
            {t('plan.requiredLabel')}
          </label>
          <label className="sm:col-span-2">
            {t('plan.image')}
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setStep({
                    ...step,
                    media_path: await uploadStepImage(current.organisationId, sop.id, f),
                  });
                } catch (err) {
                  setMessage({ kind: 'error', text: (err as Error).message });
                }
              }}
              className="block"
            />
          </label>
          {step.media_path && (
            <div className="sm:col-span-2">
              <StepImage path={step.media_path} />
            </div>
          )}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
              {t('form.save')}
            </button>
            <button type="button" onClick={() => setStep(null)} className="underline">
              {t('form.cancel')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function StepImage({ path }: { path: string }) {
  const url = useQuery({
    queryKey: ['sop-image', path],
    queryFn: () => signedStepImage(path),
    staleTime: 50 * 60 * 1000,
  });
  return url.data ? (
    <img src={url.data} alt="" className="mt-1 h-24 rounded border object-cover" />
  ) : null;
}

/** Title, purpose, PPE and hazards. Re-created per SOP version (key), so it starts from that version's values. */
function SopHeaderForm({
  sop,
  editable,
  onSave,
  onInvalid,
}: {
  sop: Sop;
  editable: boolean;
  onSave: (v: Pick<Sop, 'title' | 'purpose' | 'ppe' | 'hazards'>) => Promise<unknown>;
  onInvalid: (message: string) => void;
}) {
  const { t } = useTranslation();
  const [h, setH] = useState({
    titleEn: sop.title.en,
    titleAr: sop.title.ar ?? '',
    purposeEn: sop.purpose?.en ?? '',
    purposeAr: sop.purpose?.ar ?? '',
    ppe: (sop.ppe ?? []).join(', '),
    hazards: (sop.hazards ?? []).join(', '),
  });
  const text = (en: string, ar: string): I18nText | null =>
    en.trim() ? { en: en.trim(), ...(ar.trim() ? { ar: ar.trim() } : {}) } : null;
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!h.titleEn.trim()) return onInvalid(t('plan.titleRequired'));
    void onSave({
      title: text(h.titleEn, h.titleAr)!,
      purpose: text(h.purposeEn, h.purposeAr),
      ppe: list(h.ppe),
      hazards: list(h.hazards),
    });
  }
  return (
    <form
      onSubmit={submit}
      aria-label={t('plan.sopDetails')}
      className="mt-4 grid gap-2 text-sm sm:grid-cols-2"
    >
      <fieldset disabled={!editable} className="contents">
        <label>
          {t('plan.titleEn')}
          <input
            value={h.titleEn}
            onChange={(e) => setH({ ...h, titleEn: e.target.value })}
            className={input}
          />
        </label>
        <label>
          {t('plan.titleAr')}
          <input
            dir="rtl"
            lang="ar"
            value={h.titleAr}
            onChange={(e) => setH({ ...h, titleAr: e.target.value })}
            className={input}
          />
        </label>
        <label>
          {t('plan.purposeEn')}
          <textarea
            rows={2}
            value={h.purposeEn}
            onChange={(e) => setH({ ...h, purposeEn: e.target.value })}
            className={input}
          />
        </label>
        <label>
          {t('plan.purposeAr')}
          <textarea
            dir="rtl"
            lang="ar"
            rows={2}
            value={h.purposeAr}
            onChange={(e) => setH({ ...h, purposeAr: e.target.value })}
            className={input}
          />
        </label>
        <label>
          {t('plan.ppe')}
          <input
            value={h.ppe}
            onChange={(e) => setH({ ...h, ppe: e.target.value })}
            className={input}
          />
        </label>
        <label>
          {t('plan.hazards')}
          <input
            value={h.hazards}
            onChange={(e) => setH({ ...h, hazards: e.target.value })}
            className={input}
          />
        </label>
        {editable && (
          <div>
            <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
              {t('form.save')}
            </button>
          </div>
        )}
      </fieldset>
    </form>
  );
}
