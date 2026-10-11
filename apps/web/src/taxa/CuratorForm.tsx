import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CODE_RE } from './filters';
import { updateOrgTaxon, type OrgTaxonFields, type OrgTaxonPatch } from './api';

const IUCN = ['', 'EX', 'EW', 'CR', 'EN', 'VU', 'NT', 'LC', 'DD', 'NE'];
const ORIGINS = ['', 'native', 'endemic', 'naturalised', 'exotic', 'unknown'];
const ZONES = ['EG', 'NG', 'SG', 'WG'];
const lines = (s: string) =>
  s
    .split(/[\n,،;؛]/) // Latin and Arabic commas and semicolons
    .map((x) => x.trim())
    .filter(Boolean);

type Props = {
  orgId: string;
  taxonId: string;
  org: OrgTaxonFields;
  onSaved: () => void;
  onCancel: () => void;
};

/** Curator edit of the organisation's taxon fields (FR-TAX-05). The database allows curators only. */
export function CuratorForm({ orgId, taxonId, org, onSaved, onCancel }: Props) {
  const { t } = useTranslation();
  const names = org.attributes.common_names ?? {};
  const [code, setCode] = useState(org.inhouse_code ?? '');
  const [iucn, setIucn] = useState(org.iucn_category ?? '');
  const [origin, setOrigin] = useState(org.origin ?? '');
  const [protection, setProtection] = useState(org.protection_level ?? '');
  const [sensitive, setSensitive] = useState(org.sensitive);
  const [zones, setZones] = useState<string[]>(org.zones_present ?? []);
  const [notes, setNotes] = useState(org.notes ?? '');
  const [nameEn, setNameEn] = useState((names.en ?? []).join(', '));
  const [nameAr, setNameAr] = useState((names.ar ?? []).join('، '));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const c = code.trim().toUpperCase();
    if (c && !CODE_RE.test(c)) return setError(t('taxa.form.codePattern'));
    const common: Record<string, string[]> = {};
    if (lines(nameEn).length) common.en = lines(nameEn);
    if (lines(nameAr).length) common.ar = lines(nameAr);
    const attributes = { ...org.attributes, common_names: common };
    if (!common.en && !common.ar) delete (attributes as Record<string, unknown>).common_names;
    if (c && c === org.attributes.proposed_inhouse_code)
      delete (attributes as Record<string, unknown>).proposed_inhouse_code;
    const patch: OrgTaxonPatch = {
      inhouse_code: c || null,
      iucn_category: iucn || null,
      origin: origin || null,
      protection_level: protection.trim() || null,
      sensitive,
      zones_present: zones.length ? [...zones].sort() : null,
      notes: notes.trim() || null,
      attributes,
    };
    setSaving(true);
    try {
      await updateOrgTaxon(orgId, taxonId, patch);
      onSaved();
    } catch (err) {
      const e2 = err as Error & { code?: string };
      setError(
        e2.code === '23505'
          ? t('taxa.form.codeTaken')
          : e2.message === 'not_allowed'
            ? t('taxa.form.notAllowed')
            : e2.message,
      );
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full rounded border border-gray-300 px-2 py-1';
  return (
    <form
      onSubmit={submit}
      aria-label={t('taxa.form.title')}
      className="space-y-3 rounded border border-green-800/30 bg-green-50/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('taxa.form.code')}
          <input
            dir="ltr"
            maxLength={3}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className={`${input} font-mono`}
          />
        </label>
        <label className="text-sm">
          {t('taxa.form.iucn')}
          <select value={iucn} onChange={(e) => setIucn(e.target.value)} className={input}>
            {IUCN.map((c) => (
              <option key={c} value={c}>
                {c ? `${c} ${t(`iucn.${c}`)}` : t('taxa.form.notSet')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('taxa.form.origin')}
          <select value={origin} onChange={(e) => setOrigin(e.target.value)} className={input}>
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {o ? t(`origin.${o}`) : t('taxa.form.notSet')}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('taxa.form.protection')}
          <input
            value={protection}
            onChange={(e) => setProtection(e.target.value)}
            className={input}
          />
        </label>
        <label className="text-sm">
          {t('taxa.form.nameEn')}
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={input} />
        </label>
        <label className="text-sm">
          {t('taxa.form.nameAr')}
          <input
            dir="rtl"
            lang="ar"
            value={nameAr}
            onChange={(e) => setNameAr(e.target.value)}
            className={input}
          />
        </label>
      </div>
      <fieldset className="text-sm">
        <legend>{t('taxa.form.zones')}</legend>
        <div className="mt-1 flex gap-4">
          {ZONES.map((z) => (
            <label key={z} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={zones.includes(z)}
                onChange={(e) =>
                  setZones(e.target.checked ? [...zones, z] : zones.filter((x) => x !== z))
                }
              />
              {z}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sensitive}
          onChange={(e) => setSensitive(e.target.checked)}
        />
        {t('taxa.form.sensitive')}
      </label>
      <label className="block text-sm">
        {t('taxa.form.notes')}
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={input}
        />
      </label>
      {error && (
        <p role="alert" className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-800 px-4 py-1.5 font-medium text-white disabled:opacity-60"
        >
          {saving ? t('form.saving') : t('form.save')}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 underline">
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
