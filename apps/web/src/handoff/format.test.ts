import { describe, expect, it } from 'vitest';
import { COLUMNS, fileName, safeText, toCsv, toSheet, type ExportRow } from './format';

const ROW: ExportRow = {
  batch_id: 'b1c2d3e4-0000-0000-0000-000000000000',
  request_number: 'IR-2026-000042',
  line_no: 1,
  organisation: 'terra',
  site_code: 'TG',
  location_code: 'SG-11',
  reason: 'replace',
  category: 'plant',
  item_code: 'PLT-MORO-15L',
  external_code: null,
  description: 'Moringa oleifera, 15 L pot, "replacement" for SG03-T27_MOR',
  quantity: 1,
  unit: 'each',
  needed_by: '2026-11-15',
  est_unit_cost_aed: 85.5,
  linked_asset_tag: 'SG03-T27_MOR',
  linked_work_order: 'WO-2026-000311',
  requested_by: 'Green One',
  approved_by: 'Terra Manager',
  approved_at: '2026-11-02T08:00:00+00:00',
};

describe('export format', () => {
  it('writes the v1 columns with a BOM, quoting where needed', () => {
    const csv = toCsv([ROW]);
    expect(csv.startsWith('﻿request_number,line_no,organisation,site_code')).toBe(true);
    const line = csv.split('\r\n')[1]!;
    expect(line).toContain('IR-2026-000042,1,terra,TG,SG-11,replace,plant,PLT-MORO-15L,,');
    expect(line).toContain('"Moringa oleifera, 15 L pot, ""replacement"" for SG03-T27_MOR"');
    expect(line).toContain(',1,each,2026-11-15,85.5,SG03-T27_MOR,WO-2026-000311,');
  });

  it('keeps spreadsheets from running text as a formula', () => {
    expect(safeText('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(safeText('-5 bags')).toBe(`'-5 bags`);
    expect(safeText('Mulch')).toBe('Mulch');
    expect(toCsv([{ ...ROW, description: '@SUM(A1)' }])).toContain(`'@SUM(A1)`);
  });

  it('XLSX sheet: header then rows, numbers as numbers, empty cells null', () => {
    const sheet = toSheet([ROW]);
    expect(sheet[0]!.map((c) => c?.value)).toEqual(COLUMNS);
    const row = sheet[1]!;
    expect(row[COLUMNS.indexOf('quantity')]).toEqual({ value: 1 });
    expect(row[COLUMNS.indexOf('external_code')]).toBeNull();
  });

  it('file name carries the date and the batch', () => {
    expect(fileName(ROW.batch_id!, 'xlsx', new Date('2026-11-03T10:00:00Z'))).toBe(
      'item-requests_2026-11-03_b1c2d3e4.xlsx',
    );
  });
});
