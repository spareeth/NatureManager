import { useTranslation } from 'react-i18next';
import { fieldLabel, type FieldError, type FormSchema } from './schemaForm';

type Props = {
  schema: FormSchema | null;
  values: Record<string, unknown>;
  errors: FieldError[];
  onChange: (key: string, value: unknown) => void;
};

/** Inputs for asset.attributes, generated from the asset type's JSON Schema. */
export function AttributeFields({ schema, values, errors, onChange }: Props) {
  const { t, i18n } = useTranslation();
  const props = Object.entries(schema?.properties ?? {});
  if (props.length === 0) return null;
  const errorText = (key: string) => {
    const e = errors.find((x) => x.key === key);
    return e ? t(`form.error.${e.code}`, { limit: e.limit }) : null;
  };

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-semibold">{t('form.attributes')}</legend>
      {props.map(([key, f]) => {
        const id = `attr-${key}`;
        const label = fieldLabel(key, f, i18n.language);
        const err = errorText(key);
        const v = values[key];
        let input;
        if (f.type === 'boolean') {
          input = (
            <input
              id={id}
              type="checkbox"
              checked={v === true || v === 'true'}
              onChange={(e) => onChange(key, e.target.checked)}
            />
          );
        } else if (f.enum) {
          input = (
            <select
              id={id}
              value={String(v ?? '')}
              onChange={(e) => onChange(key, e.target.value)}
              className="w-full rounded border border-gray-300 px-2 py-1"
            >
              <option value="" />
              {f.enum.map((o) => (
                <option key={o} value={o}>
                  {t(`enum.${o}`, { defaultValue: o.replace(/_/g, ' ') })}
                </option>
              ))}
            </select>
          );
        } else if (f.type === 'array' && f.items?.enum) {
          const selected = Array.isArray(v) ? (v as string[]) : [];
          input = (
            <div id={id} role="group" aria-label={label} className="flex flex-wrap gap-x-3 gap-y-1">
              {f.items.enum.map((o) => (
                <label key={o} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(o)}
                    onChange={(e) =>
                      onChange(
                        key,
                        e.target.checked ? [...selected, o] : selected.filter((x) => x !== o),
                      )
                    }
                  />
                  {t(`enum.${o}`, { defaultValue: o.replace(/_/g, ' ') })}
                </label>
              ))}
            </div>
          );
        } else {
          const numeric = f.type === 'number' || f.type === 'integer';
          input = (
            <input
              id={id}
              type="text"
              inputMode={numeric ? 'decimal' : undefined}
              dir={numeric ? 'ltr' : undefined}
              value={v == null ? '' : String(v)}
              onChange={(e) => onChange(key, e.target.value)}
              aria-invalid={!!err}
              className="w-full rounded border border-gray-300 px-2 py-1"
            />
          );
        }
        return (
          <div key={key} className={f.type === 'boolean' ? 'flex items-center gap-2' : ''}>
            {f.type === 'array' ? (
              <span className="block text-sm text-gray-700">{label}</span>
            ) : (
              <label
                htmlFor={id}
                className={f.type === 'boolean' ? 'order-2 text-sm' : 'block text-sm text-gray-700'}
              >
                {label}
              </label>
            )}
            {input}
            {err && <p className="text-xs text-red-700">{err}</p>}
          </div>
        );
      })}
    </fieldset>
  );
}
