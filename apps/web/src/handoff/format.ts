// Export line format v1 (docs/PROCUREMENT_HANDOFF.md section 4), as CSV or XLSX (FR-REQ-06).

export type ExportRow = {
  batch_id: string | null;
  request_number: string;
  line_no: number;
  organisation: string;
  site_code: string;
  location_code: string | null;
  reason: string;
  category: string;
  item_code: string | null;
  external_code: string | null;
  description: string;
  quantity: number;
  unit: string;
  needed_by: string | null;
  est_unit_cost_aed: number | null;
  linked_asset_tag: string | null;
  linked_work_order: string | null;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

/** Column order of the file; the header row uses these names. */
export const COLUMNS: (keyof ExportRow)[] = [
  'request_number',
  'line_no',
  'organisation',
  'site_code',
  'location_code',
  'reason',
  'category',
  'item_code',
  'external_code',
  'description',
  'quantity',
  'unit',
  'needed_by',
  'est_unit_cost_aed',
  'linked_asset_tag',
  'linked_work_order',
  'requested_by',
  'approved_by',
  'approved_at',
  'batch_id',
];

/** Text that a spreadsheet would run as a formula is prefixed with ' (CSV injection). */
export function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v) : safeText(String(v));
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** RFC 4180 CSV with a UTF-8 byte order mark, so Excel opens Arabic text correctly. */
export function toCsv(rows: ExportRow[]): string {
  const lines = [
    COLUMNS.join(','),
    ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(',')),
  ];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Rows for the XLSX sheet: header plus one row per line; numbers stay numbers. */
export function toSheet(rows: ExportRow[]) {
  return [
    COLUMNS.map((c) => ({ value: c, fontWeight: 'bold' as const })),
    ...rows.map((r) =>
      COLUMNS.map((c) => {
        const v = r[c];
        if (v === null || v === undefined) return null;
        return typeof v === 'number' ? { value: v } : { value: safeText(String(v)) };
      }),
    ),
  ];
}

export const fileName = (batchId: string, ext: 'csv' | 'xlsx', at = new Date()) =>
  `item-requests_${at.toISOString().slice(0, 10)}_${batchId.slice(0, 8)}.${ext}`;

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadRows(rows: ExportRow[], batchId: string, ext: 'csv' | 'xlsx') {
  if (ext === 'csv')
    return download(
      new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      fileName(batchId, 'csv'),
    );
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const blob = await writeXlsxFile(toSheet(rows), { sheet: 'Item requests' }).toBlob();
  download(blob, fileName(batchId, 'xlsx'));
}
