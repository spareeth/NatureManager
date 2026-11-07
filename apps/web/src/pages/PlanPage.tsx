import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useOrg } from '../org/context';
import { useCurrentSite } from '../org/useSite';
import {
  createSop,
  deleteSchedule,
  fetchLibrary,
  fetchPickLists,
  fetchSchedules,
  fetchTemplates,
  generateNow,
  saveSchedule,
  saveTemplate,
  type Schedule,
  type Template,
} from '../plan/api';
import {
  describeRule,
  EMPTY_RULE,
  fromRule,
  ruleProblems,
  toRule,
  type RuleForm,
} from '../plan/rule';

const TABS = ['sops', 'templates', 'schedules'] as const;
type Tab = (typeof TABS)[number];
const input = 'w-full rounded border border-gray-300 px-2 py-1';
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Planning: SOP library, work order templates and PM schedules (managers edit; field managers read). */
export function PlanPage() {
  const { t } = useTranslation();
  const { current } = useOrg();
  const { site } = useCurrentSite();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '')
    ? (params.get('tab') as Tab)
    : 'sops';
  const canEdit = !!current?.roles.includes('manager');
  if (!current || !site) return <p className="p-4">{t('common.loading')}</p>;
  return (
    <section className="p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{t('plan.heading')}</h1>
        <nav aria-label={t('plan.sections')} className="flex gap-1 text-sm">
          {TABS.map((x) => (
            <button
              key={x}
              type="button"
              aria-pressed={tab === x}
              onClick={() => setParams({ tab: x }, { replace: true })}
              className={`rounded px-3 py-1 ${tab === x ? 'bg-green-800 text-white' : 'border'}`}
            >
              {t(`plan.tab.${x}`)}
            </button>
          ))}
        </nav>
        {!canEdit && <span className="text-sm text-gray-500">{t('plan.readOnly')}</span>}
      </div>
      <div className="mt-4">
        {tab === 'sops' && <SopList orgId={current.organisationId} canEdit={canEdit} />}
        {tab === 'templates' && (
          <Templates orgId={current.organisationId} siteId={site.id} canEdit={canEdit} />
        )}
        {tab === 'schedules' && (
          <Schedules orgId={current.organisationId} siteId={site.id} canEdit={canEdit} />
        )}
      </div>
    </section>
  );
}

function SopList({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const lib = useQuery({ queryKey: ['sop-library', orgId], queryFn: () => fetchLibrary(orgId) });
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tx = (x: { en: string; ar?: string } | undefined) =>
    x ? (i18n.language.startsWith('ar') && x.ar) || x.en : '';

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim().toUpperCase();
    if (!/^[A-Z0-9-]{2,30}$/.test(c) || !title.trim()) return setError(t('plan.sopNewInvalid'));
    try {
      navigate(`/plan/sops/${await createSop(orgId, c, { en: title.trim() })}`);
    } catch (err) {
      setError(
        (err as Error & { code?: string }).code === '23505'
          ? t('plan.codeTaken')
          : (err as Error).message,
      );
    }
  }
  return (
    <div className="max-w-4xl">
      {canEdit && (
        <form
          onSubmit={create}
          className="mb-4 flex flex-wrap items-end gap-2 text-sm"
          aria-label={t('plan.newSop')}
        >
          <label>
            {t('plan.code')}
            <input
              dir="ltr"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SOP-BED"
              className={`${input} w-40 font-mono`}
            />
          </label>
          <label className="min-w-64 flex-1">
            {t('plan.titleEn')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </label>
          <button type="submit" className="rounded bg-green-800 px-3 py-1.5 font-medium text-white">
            {t('plan.newSop')}
          </button>
          {error && (
            <p role="alert" className="w-full text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-600">
            <th className="py-2 text-start font-medium">{t('plan.code')}</th>
            <th className="py-2 text-start font-medium">{t('plan.title')}</th>
            <th className="py-2 text-start font-medium">{t('plan.current')}</th>
            <th className="py-2 text-start font-medium">{t('plan.draft')}</th>
            <th className="py-2 text-start font-medium">{t('plan.usedBy')}</th>
          </tr>
        </thead>
        <tbody>
          {(lib.data ?? []).map((r) => (
            <tr key={r.code} className="border-b">
              <td className="py-1.5 font-mono" dir="ltr">
                {r.code}
              </td>
              <td className="py-1.5">{tx(r.current?.title ?? r.draft?.title)}</td>
              <td className="py-1.5">
                {r.current ? (
                  <Link className="underline" to={`/plan/sops/${r.current.id}`}>
                    v{r.current.version} · {t('plan.steps', { count: r.current.steps })}
                  </Link>
                ) : (
                  ''
                )}
                {r.retired > 0 && (
                  <span className="ms-1 text-xs text-gray-500">
                    ({t('plan.retiredCount', { count: r.retired })})
                  </span>
                )}
              </td>
              <td className="py-1.5">
                {r.draft ? (
                  <Link className="text-amber-800 underline" to={`/plan/sops/${r.draft.id}`}>
                    v{r.draft.version} {t('plan.draftLabel')}
                  </Link>
                ) : (
                  ''
                )}
              </td>
              <td className="py-1.5">{t('plan.templatesCount', { count: r.templates })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lib.data?.length === 0 && <p className="mt-4 text-gray-600">{t('plan.noSops')}</p>}
    </div>
  );
}

function Templates({
  orgId,
  siteId,
  canEdit,
}: {
  orgId: string;
  siteId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['wo-templates', orgId],
    queryFn: () => fetchTemplates(orgId),
  });
  const picks = useQuery({
    queryKey: ['plan-picks', orgId, siteId],
    queryFn: () => fetchPickLists(orgId, siteId),
  });
  const [edit, setEdit] = useState<(Omit<Template, 'id'> & { id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sopLabel = (id: string | null) => picks.data?.sops.find((s) => s.id === id);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    if (!edit.code.trim() || !edit.title.trim()) return setError(t('plan.templateInvalid'));
    setError(null);
    try {
      await saveTemplate(orgId, {
        ...edit,
        code: edit.code.trim().toUpperCase(),
        title: edit.title.trim(),
      });
      setEdit(null);
      await qc.invalidateQueries({ queryKey: ['wo-templates'] });
    } catch (err) {
      setError(
        (err as Error & { code?: string }).code === '23505'
          ? t('plan.codeTaken')
          : (err as Error).message,
      );
    }
  }
  return (
    <div className="max-w-5xl">
      {canEdit && !edit && (
        <button
          type="button"
          className="mb-3 rounded bg-green-800 px-3 py-1 text-sm text-white"
          onClick={() =>
            setEdit({
              code: '',
              title: '',
              wo_type: 'preventive',
              default_priority: 'P3',
              sop_id: null,
              team_id: null,
              est_minutes: 60,
            })
          }
        >
          {t('plan.newTemplate')}
        </button>
      )}
      {edit && (
        <form
          onSubmit={save}
          aria-label={t('plan.templateForm')}
          className="mb-4 grid gap-2 rounded border p-3 text-sm sm:grid-cols-3"
        >
          <label>
            {t('plan.code')}
            <input
              dir="ltr"
              value={edit.code}
              onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })}
              className={`${input} font-mono`}
            />
          </label>
          <label className="sm:col-span-2">
            {t('plan.title')}
            <input
              value={edit.title}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
              className={input}
            />
          </label>
          <label>
            {t('wo.type')}
            <select
              value={edit.wo_type}
              onChange={(e) => setEdit({ ...edit, wo_type: e.target.value })}
              className={input}
            >
              {['preventive', 'reactive', 'inspection', 'project'].map((x) => (
                <option key={x} value={x}>
                  {t(`wo.types.${x}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('plan.priority')}
            <select
              value={edit.default_priority}
              onChange={(e) => setEdit({ ...edit, default_priority: e.target.value })}
              className={input}
            >
              {['P1', 'P2', 'P3', 'P4'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            {t('wo.minutes')}
            <input
              inputMode="numeric"
              dir="ltr"
              value={edit.est_minutes ?? ''}
              onChange={(e) => setEdit({ ...edit, est_minutes: Number(e.target.value) || null })}
              className={input}
            />
          </label>
          <label>
            {t('wo.sop')}
            <select
              value={edit.sop_id ?? ''}
              onChange={(e) => setEdit({ ...edit, sop_id: e.target.value || null })}
              className={input}
            >
              <option value="" />
              {(picks.data?.sops ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} v{s.version}
                  {s.status === 'draft' ? ` (${t('plan.draftLabel')})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('wo.team')}
            <select
              value={edit.team_id ?? ''}
              onChange={(e) => setEdit({ ...edit, team_id: e.target.value || null })}
              className={input}
            >
              <option value="" />
              {(picks.data?.teams ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <p className="self-end text-xs text-gray-500">{t('plan.sopPinNote')}</p>
          {error && (
            <p role="alert" className="text-red-700 sm:col-span-3">
              {error}
            </p>
          )}
          <div className="flex gap-3 sm:col-span-3">
            <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
              {t('form.save')}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="underline">
              {t('form.cancel')}
            </button>
          </div>
        </form>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-600">
            {['code', 'title', 'type', 'sop', 'team', 'minutes'].map((h) => (
              <th key={h} className="py-2 text-start font-medium">
                {t(`plan.col.${h}`)}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((x) => (
            <tr key={x.id} className="border-b">
              <td className="py-1.5 font-mono" dir="ltr">
                {x.code}
              </td>
              <td className="py-1.5">{x.title}</td>
              <td className="py-1.5">
                {t(`wo.types.${x.wo_type}`)} · {x.default_priority}
              </td>
              <td className="py-1.5 font-mono text-xs" dir="ltr">
                {sopLabel(x.sop_id)
                  ? `${sopLabel(x.sop_id)!.code} v${sopLabel(x.sop_id)!.version}`
                  : ''}
              </td>
              <td className="py-1.5">
                {picks.data?.teams.find((tm) => tm.id === x.team_id)?.name ?? ''}
              </td>
              <td className="py-1.5">{x.est_minutes ?? ''}</td>
              <td className="py-1.5 text-end">
                {canEdit && (
                  <button type="button" className="underline" onClick={() => setEdit(x)}>
                    {t('edit.edit')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScheduleDraft = Omit<Schedule, 'id' | 'last_generated_until' | 'rule'> & {
  id?: string;
  rule: RuleForm;
};

function Schedules({
  orgId,
  siteId,
  canEdit,
}: {
  orgId: string;
  siteId: string;
  canEdit: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['pm-schedules', orgId],
    queryFn: () => fetchSchedules(orgId),
  });
  const templates = useQuery({
    queryKey: ['wo-templates', orgId],
    queryFn: () => fetchTemplates(orgId),
  });
  const picks = useQuery({
    queryKey: ['plan-picks', orgId, siteId],
    queryFn: () => fetchPickLists(orgId, siteId),
  });
  const [edit, setEdit] = useState<ScheduleDraft | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const loc = (id: string | null) => picks.data?.locations.find((l) => l.id === id)?.code ?? '';
  const type = (id: string | null) => picks.data?.types.find((x) => x.id === id);
  const target = (s: Schedule) =>
    s.target_kind === 'location'
      ? loc(s.target_location_id)
      : s.target_kind === 'asset_type_in_location'
        ? `${(i18n.language.startsWith('ar') && type(s.target_asset_type_id)?.name_ar) || type(s.target_asset_type_id)?.name || ''} · ${loc(s.target_location_id)}`
        : t('plan.oneAsset');

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const problems = ruleProblems(edit.rule);
    const needsLoc = edit.target_kind !== 'asset';
    if (
      !edit.template_id ||
      (needsLoc && !edit.target_location_id) ||
      (edit.target_kind === 'asset_type_in_location' && !edit.target_asset_type_id) ||
      problems.length
    ) {
      return setMessage({ kind: 'error', text: t('plan.scheduleInvalid') });
    }
    try {
      const { rule, ...rest } = edit;
      await saveSchedule(orgId, {
        ...rest,
        target_asset_id: edit.target_kind === 'asset' ? edit.target_asset_id : null,
        target_asset_type_id:
          edit.target_kind === 'asset_type_in_location' ? edit.target_asset_type_id : null,
        target_location_id: needsLoc ? edit.target_location_id : null,
        rule: toRule({ ...rule, each: edit.target_kind === 'location' ? rule.each : '' }),
      });
      setEdit(null);
      setMessage({ kind: 'ok', text: t('plan.scheduleSaved') });
      await qc.invalidateQueries({ queryKey: ['pm-schedules'] });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }
  async function generate() {
    setMessage(null);
    try {
      const r = await generateNow(orgId);
      setMessage({
        kind: 'ok',
        text: t('plan.generated', {
          created: r.created,
          existing: r.existing,
          over: r.over_capacity,
        }),
      });
      await qc.invalidateQueries({ queryKey: ['pm-schedules'] });
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message });
    }
  }
  const r = edit?.rule;
  const setRule = (p: Partial<RuleForm>) =>
    edit && setEdit({ ...edit, rule: { ...edit.rule, ...p } });
  return (
    <div className="max-w-6xl">
      <div className="mb-3 flex gap-3">
        {canEdit && !edit && (
          <button
            type="button"
            className="rounded bg-green-800 px-3 py-1 text-sm text-white"
            onClick={() =>
              setEdit({
                template_id: '',
                target_kind: 'location',
                target_asset_id: null,
                target_asset_type_id: null,
                target_location_id: null,
                rule: { ...EMPTY_RULE, each: 'bed' },
                max_per_day: 10,
                horizon_days: 14,
                active: true,
              })
            }
          >
            {t('plan.newSchedule')}
          </button>
        )}
        <button
          type="button"
          onClick={() => void generate()}
          className="rounded border border-green-800 px-3 py-1 text-sm text-green-900"
        >
          {t('plan.generateNow')}
        </button>
      </div>
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`mb-3 rounded px-2 py-1 text-sm ${message.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-900'}`}
        >
          {message.text}
        </p>
      )}
      {edit && r && (
        <form
          onSubmit={save}
          aria-label={t('plan.scheduleForm')}
          className="mb-4 grid gap-3 rounded border p-3 text-sm md:grid-cols-3"
        >
          <label>
            {t('plan.template')}
            <select
              value={edit.template_id}
              onChange={(e) => setEdit({ ...edit, template_id: e.target.value })}
              className={input}
            >
              <option value="" />
              {(templates.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.code} · {x.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('plan.targetKind')}
            <select
              value={edit.target_kind}
              onChange={(e) =>
                setEdit({ ...edit, target_kind: e.target.value as Schedule['target_kind'] })
              }
              className={input}
            >
              <option value="location">{t('plan.kind.location')}</option>
              <option value="asset_type_in_location">
                {t('plan.kind.asset_type_in_location')}
              </option>
            </select>
          </label>
          <label>
            {t('plan.where')}
            <select
              value={edit.target_location_id ?? ''}
              onChange={(e) => setEdit({ ...edit, target_location_id: e.target.value || null })}
              className={input}
            >
              <option value="" />
              {(picks.data?.locations ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.kind === 'zone'
                    ? `${l.code} ${t(`map.zones.${l.code}`, { defaultValue: '' })}`
                    : `  ${l.code}`}
                </option>
              ))}
            </select>
          </label>
          {edit.target_kind === 'asset_type_in_location' ? (
            <label>
              {t('assets.type')}
              <select
                value={edit.target_asset_type_id ?? ''}
                onChange={(e) => setEdit({ ...edit, target_asset_type_id: e.target.value || null })}
                className={input}
              >
                <option value="" />
                {(picks.data?.types ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {(i18n.language.startsWith('ar') && x.name_ar) || x.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              {t('plan.each')}
              <select
                value={r.each}
                onChange={(e) => setRule({ each: e.target.value as RuleForm['each'] })}
                className={input}
              >
                <option value="">{t('plan.eachNone')}</option>
                <option value="bed">{t('plan.eachBed')}</option>
                <option value="zone">{t('plan.eachZone')}</option>
              </select>
            </label>
          )}
          <label>
            {t('plan.freq')}
            <select
              value={r.freq}
              onChange={(e) => setRule({ freq: e.target.value as RuleForm['freq'] })}
              className={input}
            >
              {['daily', 'weekly', 'monthly'].map((f) => (
                <option key={f} value={f}>
                  {t(`plan.freqs.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('plan.interval')}
            <input
              inputMode="numeric"
              dir="ltr"
              value={r.interval}
              onChange={(e) => setRule({ interval: Number(e.target.value) })}
              className={input}
            />
          </label>
          {r.freq !== 'monthly' ? (
            <fieldset className="md:col-span-3">
              <legend>{t('plan.weekdays')}</legend>
              <div className="mt-1 flex flex-wrap gap-3">
                {WEEKDAYS.map((d) => (
                  <label key={d} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={r.weekdays.includes(d)}
                      onChange={(e) =>
                        setRule({
                          weekdays: e.target.checked
                            ? [...r.weekdays, d]
                            : r.weekdays.filter((x) => x !== d),
                        })
                      }
                    />
                    {t(`plan.day.${d}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <label className="md:col-span-3">
              {t('plan.monthdays')}
              <input
                dir="ltr"
                value={r.monthdays.join(', ')}
                placeholder="1, 15"
                onChange={(e) =>
                  setRule({
                    monthdays: e.target.value
                      .split(/[ ,،]+/)
                      .filter(Boolean)
                      .map(Number)
                      .filter(Number.isFinite),
                  })
                }
                className={input}
              />
            </label>
          )}
          <label>
            {t('plan.seasonFrom')}
            <select
              value={r.seasonFrom ?? ''}
              onChange={(e) => setRule({ seasonFrom: Number(e.target.value) || null })}
              className={input}
            >
              <option value="">{t('plan.allYear')}</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {t(`plan.month.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('plan.seasonTo')}
            <select
              value={r.seasonTo ?? ''}
              onChange={(e) => setRule({ seasonTo: Number(e.target.value) || null })}
              className={input}
            >
              <option value="">{t('plan.allYear')}</option>
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {t(`plan.month.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              {t('plan.maxPerDay')}
              <input
                inputMode="numeric"
                dir="ltr"
                value={edit.max_per_day ?? ''}
                onChange={(e) => setEdit({ ...edit, max_per_day: Number(e.target.value) || null })}
                className={input}
              />
            </label>
            <label>
              {t('plan.horizon')}
              <input
                inputMode="numeric"
                dir="ltr"
                value={edit.horizon_days}
                onChange={(e) => setEdit({ ...edit, horizon_days: Number(e.target.value) || 14 })}
                className={input}
              />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={edit.active}
              onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
            />
            {t('plan.active')}
          </label>
          <p className="text-gray-600 md:col-span-2" data-testid="rule-summary">
            {describeRule(toRule(r))}
          </p>
          <div className="flex gap-3 md:col-span-3">
            <button type="submit" className="rounded bg-green-800 px-3 py-1 text-white">
              {t('form.save')}
            </button>
            <button type="button" onClick={() => setEdit(null)} className="underline">
              {t('form.cancel')}
            </button>
          </div>
        </form>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-600">
            {['template', 'target', 'rule', 'maxPerDay', 'generated'].map((h) => (
              <th key={h} className="py-2 text-start font-medium">
                {t(`plan.col.${h}`)}
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((s) => (
            <tr key={s.id} className={`border-b ${s.active ? '' : 'text-gray-400'}`}>
              <td className="py-1.5 font-mono text-xs" dir="ltr">
                {templates.data?.find((x) => x.id === s.template_id)?.code}
              </td>
              <td className="py-1.5">{target(s)}</td>
              <td className="py-1.5">
                {describeRule(s.rule)}
                {!s.active && ` (${t('plan.inactive')})`}
              </td>
              <td className="py-1.5">{s.max_per_day ?? ''}</td>
              <td className="py-1.5">{s.last_generated_until ?? ''}</td>
              <td className="py-1.5 text-end whitespace-nowrap">
                {canEdit && (
                  <>
                    <button
                      type="button"
                      className="underline"
                      onClick={() => setEdit({ ...s, rule: fromRule(s.rule) })}
                    >
                      {t('edit.edit')}
                    </button>{' '}
                    <button
                      type="button"
                      className="text-red-700 underline"
                      onClick={async () => {
                        if (window.confirm(t('plan.confirmDelete'))) {
                          try {
                            await deleteSchedule(s.id);
                            await qc.invalidateQueries({ queryKey: ['pm-schedules'] });
                          } catch (err) {
                            setMessage({
                              kind: 'error',
                              text:
                                (err as Error & { code?: string }).code === '23503'
                                  ? t('plan.scheduleInUse')
                                  : (err as Error).message,
                            });
                          }
                        }
                      }}
                    >
                      {t('cp.delete')}
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.data?.length === 0 && <p className="mt-4 text-gray-600">{t('plan.noSchedules')}</p>}
    </div>
  );
}
