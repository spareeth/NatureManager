// Attribute form helpers driven by asset_type.attribute_schema (JSON Schema subset used by the
// catalogue: number, integer, boolean, string with optional enum, array of string enums,
// minimum and maximum). Arabic labels come from the "x-title-ar" keyword.

export type FieldSchema = {
  type?: 'number' | 'integer' | 'boolean' | 'string' | 'array';
  title?: string;
  'x-title-ar'?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  items?: { type?: string; enum?: string[] };
};
export type FormSchema = { type?: string; properties?: Record<string, FieldSchema> };

export function fieldLabel(key: string, f: FieldSchema, lang: string): string {
  return (lang.startsWith('ar') ? f['x-title-ar'] : undefined) ?? f.title ?? key;
}

/** Form input value (string from an input, boolean from a checkbox, string[] from a multi select) to stored JSON. */
export function coerce(f: FieldSchema, raw: unknown): unknown {
  if (raw === '' || raw == null) return undefined;
  switch (f.type) {
    case 'number':
    case 'integer': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
      return Number.isFinite(n) ? n : raw; // keep the bad text so validation can report it
    }
    case 'boolean':
      return raw === true || raw === 'true';
    case 'array':
      return Array.isArray(raw) && raw.length ? raw : undefined;
    default:
      return String(raw).trim() || undefined;
  }
}

export type FieldError = {
  key: string;
  code: 'number' | 'integer' | 'min' | 'max' | 'enum';
  limit?: number;
};

export function validateAttributes(
  schema: FormSchema | null,
  values: Record<string, unknown>,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const [key, f] of Object.entries(schema?.properties ?? {})) {
    const v = values[key];
    if (v === undefined) continue;
    if (f.type === 'number' || f.type === 'integer') {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        errors.push({ key, code: 'number' });
        continue;
      }
      if (f.type === 'integer' && !Number.isInteger(v)) errors.push({ key, code: 'integer' });
      if (f.minimum !== undefined && v < f.minimum)
        errors.push({ key, code: 'min', limit: f.minimum });
      if (f.maximum !== undefined && v > f.maximum)
        errors.push({ key, code: 'max', limit: f.maximum });
    } else if (f.enum && !f.enum.includes(String(v))) {
      errors.push({ key, code: 'enum' });
    } else if (
      f.type === 'array' &&
      f.items?.enum &&
      Array.isArray(v) &&
      v.some((x) => !f.items!.enum!.includes(String(x)))
    ) {
      errors.push({ key, code: 'enum' });
    }
  }
  return errors;
}

/** Stored attributes for saving: schema fields coerced, empty ones dropped, unknown keys kept. */
export function buildAttributes(
  schema: FormSchema | null,
  inputs: Record<string, unknown>,
  previous: Record<string, unknown> = {},
): Record<string, unknown> {
  const props = schema?.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(previous)) if (!(k in props)) out[k] = v;
  for (const [k, f] of Object.entries(props)) {
    const v = coerce(f, inputs[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
