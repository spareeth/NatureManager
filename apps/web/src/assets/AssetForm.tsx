import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  checkTag,
  createAsset,
  fetchAccessions,
  fetchAssetTypeOptions,
  findAssetByTag,
  searchTaxa,
  setAssetStatus,
  suggestTag,
  updateAsset,
  type AssetTypeOption,
  type AssetWrite,
  type TaxonOption,
} from './editApi';
import type { AssetDetail } from './api';
import { AttributeFields } from './AttributeFields';
import {
  buildAttributes,
  validateAttributes,
  type FieldError,
  type FormSchema,
} from './schemaForm';
import { defaultStatus, POSITION_SOURCES, statusesFor } from './statuses';

export type NewGeometry = { ewkt: string; anchorEwkt: string; polygon: boolean };

type Props = {
  orgId: string;
  siteId: string;
  /** Create mode: where the new asset goes. */
  geometry?: NewGeometry;
  /** Edit mode: the asset as loaded for the detail page. */
  asset?: AssetDetail;
  onSaved: (id: string) => void;
  onCancel: () => void;
};

const toNum = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm text-gray-700">
        {label}
      </label>
      {children}
      {hint}
    </div>
  );
}

export function AssetForm({ orgId, siteId, geometry, asset, onSaved, onCancel }: Props) {
  const { t, i18n } = useTranslation();
  const editing = !!asset;
  const types = useQuery({
    queryKey: ['asset-type-options', orgId],
    queryFn: () => fetchAssetTypeOptions(orgId),
  });

  const [typeId, setTypeId] = useState(asset?.type.id ?? '');
  const [taxon, setTaxon] = useState<TaxonOption | null>(
    asset?.taxon
      ? {
          id: asset.taxon.id,
          scientific_name: asset.taxon.scientific_name,
          authorship: asset.taxon.authorship,
          family: asset.taxon.family,
          common_names: asset.taxon.common_names,
          inhouse_code: asset.taxon.inhouse_code,
          iucn_category: asset.taxon.iucn_category,
        }
      : null,
  );
  const [taxonQ, setTaxonQ] = useState('');
  const [accessionId, setAccessionId] = useState(asset?.accession?.id ?? '');
  const [parent, setParent] = useState<{ id: string; tag_code: string } | null>(
    asset?.parent ?? null,
  );
  const [parentQ, setParentQ] = useState('');
  const [statusInput, setStatus] = useState(asset?.status ?? '');
  const [statusReason, setStatusReason] = useState('');
  const [condition, setCondition] = useState(asset?.condition?.toString() ?? '');
  const [criticality, setCriticality] = useState(asset?.criticality?.toString() ?? '');
  const [installDate, setInstallDate] = useState(asset?.install_date ?? '');
  const [tagInput, setTag] = useState(asset?.tag_code ?? '');
  const [tagTouched, setTagTouched] = useState(editing);
  const [name, setName] = useState(asset?.name ?? '');
  const [barcode, setBarcode] = useState(asset?.barcode ?? '');
  const [plantCount, setPlantCount] = useState(asset?.plant_count?.toString() ?? '');
  const [positionSource, setPositionSource] = useState(asset?.position_source ?? '');
  const [accuracy, setAccuracy] = useState(asset?.position_accuracy_m?.toString() ?? '');
  const [attrs, setAttrs] = useState<Record<string, unknown>>(asset?.attributes ?? {});
  const [attrErrors, setAttrErrors] = useState<FieldError[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const allTypes = types.data ?? [];
  const typeOptions = geometry?.polygon
    ? allTypes.filter((ty) => ty.asset_class === 'living')
    : allTypes;
  // In edit mode the asset carries its own type, so the form works before the catalogue loads.
  const type: AssetTypeOption | undefined =
    allTypes.find((ty) => ty.id === typeId) ??
    (asset && asset.type.id === typeId
      ? {
          ...asset.type,
          name_ar: null,
          attribute_schema: asset.type.attribute_schema as Record<string, unknown>,
        }
      : undefined);
  const cls = type?.asset_class;
  const schema = (type?.attribute_schema ?? null) as FormSchema | null;
  const group = !!geometry?.polygon || type?.code === 'GROUP';
  const typeName = (ty: AssetTypeOption) =>
    (i18n.language.startsWith('ar') && ty.name_ar) || ty.name;

  // Suggested tag (create mode, until the user edits it).
  const suggestion = useQuery({
    queryKey: ['suggest-tag', siteId, geometry?.anchorEwkt, typeId, taxon?.id, group],
    enabled: !editing && !!geometry && !!typeId,
    queryFn: () =>
      suggestTag({ siteId, ewkt: geometry!.anchorEwkt, typeId, taxonId: taxon?.id, group }),
  });
  // Until the user edits it, the tag is the suggestion.
  const tag = tagTouched ? tagInput : (suggestion.data ?? tagInput);
  // A status that fits the class: the chosen one, else the asset's own, else the class default.
  const status =
    cls && statusesFor(cls).includes(statusInput)
      ? statusInput
      : cls
        ? editing && asset && statusesFor(cls).includes(asset.status)
          ? asset.status
          : defaultStatus(cls)
        : statusInput;

  const tagCheck = useQuery({
    queryKey: ['check-tag', orgId, tag, cls, asset?.id],
    enabled: !!tag && !!cls,
    queryFn: () => checkTag(orgId, tag, cls!, asset?.id),
  });

  const taxa = useQuery({
    queryKey: ['taxon-search', orgId, taxonQ],
    enabled: taxonQ.trim().length >= 2,
    queryFn: () => searchTaxa(orgId, taxonQ),
  });
  const accessions = useQuery({
    queryKey: ['accessions', orgId, taxon?.id],
    enabled: !!taxon,
    queryFn: () => fetchAccessions(orgId, taxon!.id),
  });
  const parents = useQuery({
    queryKey: ['parent-search', orgId, parentQ],
    enabled: parentQ.trim().length >= 2,
    queryFn: () => findAssetByTag(orgId, parentQ.trim()),
  });

  const tagProblem = useMemo(() => {
    if (!tag) return t('form.tagRequired');
    if (!tagCheck.data) return null;
    if (!tagCheck.data.pattern_ok)
      return t(cls === 'built' ? 'form.tagPatternBuilt' : 'form.tagPatternLiving');
    if (tagCheck.data.taken_by) return t('form.tagTaken');
    return null;
  }, [tag, tagCheck.data, cls, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!type) return setFormError(t('form.typeRequired'));
    const attributes = buildAttributes(schema, attrs, editing ? asset!.attributes : {});
    const errs = validateAttributes(schema, attributes);
    setAttrErrors(errs);
    const cond = toNum(condition);
    const crit = toNum(criticality);
    const acc = toNum(accuracy);
    const count = toNum(plantCount);
    if (tagProblem || tagCheck.isFetching) return setFormError(tagProblem ?? t('form.tagChecking'));
    if (errs.length) return setFormError(t('form.fixFields'));
    for (const n of [cond, crit])
      if (n !== null && !(Number.isInteger(n) && n >= 1 && n <= 5))
        return setFormError(t('form.scale'));
    if (
      (acc !== null && !(acc >= 0)) ||
      (count !== null && !(Number.isInteger(count) && count >= 0))
    )
      return setFormError(t('form.fixFields'));

    const values: AssetWrite = {
      asset_type_id: type.id,
      tag_code: tag.trim(),
      name: name.trim() || null,
      barcode: barcode.trim() || null,
      condition: cond,
      criticality: crit,
      install_date: installDate || null,
      taxon_id: cls === 'living' ? (taxon?.id ?? null) : null,
      accession_id: cls === 'living' ? accessionId || null : null,
      parent_asset_id: cls === 'living' ? (parent?.id ?? null) : null,
      plant_count: count,
      position_source: positionSource || null,
      position_accuracy_m: acc,
      attributes,
    };
    setSaving(true);
    try {
      if (editing) {
        await updateAsset(asset!.id, values);
        if (status !== asset!.status)
          await setAssetStatus(asset!.id, status, statusReason.trim() || null);
        onSaved(asset!.id);
      } else {
        onSaved(await createAsset(orgId, siteId, geometry!.ewkt, status, values));
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const input = 'w-full rounded border border-gray-300 px-2 py-1';
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      aria-label={editing ? t('form.editTitle') : t('form.createTitle')}
    >
      <Field label={t('form.type')} htmlFor="f-type">
        <select
          id="f-type"
          required
          value={typeId}
          disabled={editing}
          onChange={(e) => setTypeId(e.target.value)}
          className={input}
        >
          <option value="" />
          {(['living', 'built'] as const).map((c) => {
            const opts = typeOptions.filter((ty) => ty.asset_class === c);
            return opts.length ? (
              <optgroup key={c} label={t(`assets.${c}`)}>
                {opts.map((ty) => (
                  <option key={ty.id} value={ty.id}>
                    {typeName(ty)}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </Field>

      {cls === 'living' && (
        <>
          <Field label={t('form.taxon')} htmlFor="f-taxon">
            {taxon ? (
              <div className="flex items-center justify-between rounded border border-gray-300 px-2 py-1">
                <span>
                  <i>{taxon.scientific_name}</i>
                  {taxon.inhouse_code && (
                    <span className="text-gray-500"> ({taxon.inhouse_code})</span>
                  )}
                </span>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => {
                    setTaxon(null);
                    setAccessionId('');
                  }}
                >
                  {t('form.change')}
                </button>
              </div>
            ) : (
              <>
                <input
                  id="f-taxon"
                  type="search"
                  value={taxonQ}
                  onChange={(e) => setTaxonQ(e.target.value)}
                  placeholder={t('form.taxonHint')}
                  className={input}
                  autoComplete="off"
                />
                {(taxa.data ?? []).length > 0 && (
                  <ul
                    role="listbox"
                    aria-label={t('form.taxon')}
                    className="mt-1 max-h-40 overflow-auto rounded border bg-white text-sm shadow"
                  >
                    {taxa.data!.map((tx) => (
                      <li key={tx.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="w-full px-2 py-1 text-start hover:bg-green-50"
                          onClick={() => {
                            setTaxon(tx);
                            setTaxonQ('');
                          }}
                        >
                          <i>{tx.scientific_name}</i>
                          {tx.inhouse_code && (
                            <span className="text-gray-500"> ({tx.inhouse_code})</span>
                          )}
                          {tx.common_names?.en?.[0] && (
                            <span className="text-gray-500"> · {tx.common_names.en[0]}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Field>
          {taxon && (accessions.data ?? []).length > 0 && (
            <Field label={t('form.accession')} htmlFor="f-acc">
              <select
                id="f-acc"
                value={accessionId}
                onChange={(e) => setAccessionId(e.target.value)}
                className={input}
              >
                <option value="" />
                {accessions.data!.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accession_number}
                    {a.received_date ? ` · ${a.received_date}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}

      <Field
        label={t('form.tag')}
        htmlFor="f-tag"
        hint={
          <p
            className={`text-xs ${tagProblem ? 'text-red-700' : 'text-gray-500'}`}
            data-testid="tag-hint"
          >
            {tagProblem ??
              (!editing && geometry && typeId && suggestion.isFetched && !suggestion.data
                ? t('form.noBed')
                : !editing && !tagTouched && tag
                  ? t('form.tagSuggested')
                  : '')}
          </p>
        }
      >
        <input
          id="f-tag"
          dir="ltr"
          value={tag}
          onChange={(e) => {
            setTagTouched(true);
            setTag(e.target.value.toUpperCase());
          }}
          aria-invalid={!!tagProblem}
          className={`${input} font-mono`}
        />
      </Field>

      {cls && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('form.status')} htmlFor="f-status">
            <select
              id="f-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={input}
            >
              {statusesFor(cls).map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('form.installDate')} htmlFor="f-date">
            <input
              id="f-date"
              type="date"
              value={installDate}
              onChange={(e) => setInstallDate(e.target.value)}
              className={input}
            />
          </Field>
          {editing && status !== asset!.status && (
            <div className="col-span-2">
              <Field label={t('form.statusReason')} htmlFor="f-reason">
                <input
                  id="f-reason"
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  className={input}
                />
              </Field>
            </div>
          )}
          <Field label={t('form.condition')} htmlFor="f-cond">
            <select
              id="f-cond"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className={input}
            >
              <option value="" />
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {t(`form.conditionScale.${n}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('form.criticality')} htmlFor="f-crit">
            <select
              id="f-crit"
              value={criticality}
              onChange={(e) => setCriticality(e.target.value)}
              className={input}
            >
              <option value="" />
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Field label={t('form.name')} htmlFor="f-name">
        <input
          id="f-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
      </Field>
      {group && (
        <Field label={t('form.plantCount')} htmlFor="f-count">
          <input
            id="f-count"
            inputMode="numeric"
            dir="ltr"
            value={plantCount}
            onChange={(e) => setPlantCount(e.target.value)}
            className={input}
          />
        </Field>
      )}
      {cls === 'living' && (
        <Field label={t('form.parent')} htmlFor="f-parent">
          {parent ? (
            <div className="flex items-center justify-between rounded border border-gray-300 px-2 py-1">
              <span className="font-mono" dir="ltr">
                {parent.tag_code}
              </span>
              <button type="button" className="text-sm underline" onClick={() => setParent(null)}>
                {t('form.remove')}
              </button>
            </div>
          ) : (
            <>
              <input
                id="f-parent"
                dir="ltr"
                value={parentQ}
                onChange={(e) => setParentQ(e.target.value.toUpperCase())}
                placeholder={t('form.parentHint')}
                className={`${input} font-mono`}
                autoComplete="off"
              />
              {(parents.data ?? []).filter((p) => p.id !== asset?.id).length > 0 && (
                <ul className="mt-1 rounded border bg-white text-sm shadow">
                  {parents
                    .data!.filter((p) => p.id !== asset?.id)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-2 py-1 text-start font-mono hover:bg-green-50"
                          dir="ltr"
                          onClick={() => {
                            setParent(p);
                            setParentQ('');
                          }}
                        >
                          {p.tag_code}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
        </Field>
      )}
      <Field label={t('form.barcode')} htmlFor="f-barcode">
        <input
          id="f-barcode"
          dir="ltr"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          className={input}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('form.positionSource')} htmlFor="f-source">
          <select
            id="f-source"
            value={positionSource}
            onChange={(e) => setPositionSource(e.target.value)}
            className={input}
          >
            <option value="" />
            {POSITION_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`position.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('form.accuracy')} htmlFor="f-accuracy">
          <input
            id="f-accuracy"
            inputMode="decimal"
            dir="ltr"
            value={accuracy}
            onChange={(e) => setAccuracy(e.target.value)}
            className={input}
          />
        </Field>
      </div>

      <AttributeFields
        schema={schema}
        values={attrs}
        errors={attrErrors}
        onChange={(k, v) => setAttrs((a) => ({ ...a, [k]: v }))}
      />

      {formError && (
        <p role="alert" className="rounded bg-red-50 px-2 py-1 text-sm text-red-800">
          {formError}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-green-800 px-4 py-1.5 font-medium text-white disabled:opacity-60"
        >
          {saving ? t('form.saving') : editing ? t('form.save') : t('form.create')}
        </button>
        <button type="button" onClick={onCancel} className="px-2 py-1.5 underline">
          {t('form.cancel')}
        </button>
      </div>
    </form>
  );
}
