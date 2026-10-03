// Read-only rendering of asset.attributes using the asset type's JSON Schema (titles, order).
// Editing forms from the same schema come in task 1.4.

type SchemaProp = {
  title?: string;
  'x-title-ar'?: string;
  type?: string | string[];
  enum?: unknown[];
};
export type AttributeSchema = { type?: string; properties?: Record<string, SchemaProp> };
export type AttributeRow = { key: string; label: string; value: string };

function show(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Schema properties first, in schema order; then any extra keys stored on the asset. */
export function attributeRows(
  attributes: Record<string, unknown> | null,
  schema: AttributeSchema | null,
  lang = 'en',
): AttributeRow[] {
  const attrs = attributes ?? {};
  const props = schema?.properties ?? {};
  const rows: AttributeRow[] = [];
  for (const [key, p] of Object.entries(props)) {
    const value = show(attrs[key]);
    const label = (lang.startsWith('ar') ? p['x-title-ar'] : undefined) ?? p.title ?? key;
    if (value) rows.push({ key, label, value });
  }
  for (const [key, v] of Object.entries(attrs)) {
    if (key in props) continue;
    const value = show(v);
    if (value) rows.push({ key, label: key, value });
  }
  return rows;
}
