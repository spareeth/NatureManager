// A4 label sheet, 24 labels in 3 columns by 8 rows of 70 x 37 mm (fills A4 edge to edge; a common
// 24-up stock). All sizes in millimetres. startAt lets a part-used sheet be reused.

export type SheetSpec = {
  pageWidth: number;
  pageHeight: number;
  columns: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  marginLeft: number;
  marginTop: number;
  gapX: number;
  gapY: number;
};

export const A4_24: SheetSpec = {
  pageWidth: 210,
  pageHeight: 297,
  columns: 3,
  rows: 8,
  labelWidth: 70,
  labelHeight: 37,
  marginLeft: 0,
  marginTop: 0.5,
  gapX: 0,
  gapY: 0,
};

export const perPage = (s: SheetSpec) => s.columns * s.rows;

export type Slot = { page: number; index: number; x: number; y: number };

/** Positions for `count` labels, filling row by row, starting at label `startAt` (1-based) of the first sheet. */
export function labelSlots(count: number, startAt = 1, s: SheetSpec = A4_24): Slot[] {
  const n = perPage(s);
  const first = Math.min(Math.max(Math.trunc(startAt), 1), n) - 1;
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    const pos = first + i;
    const index = pos % n;
    const col = index % s.columns;
    const row = Math.floor(index / s.columns);
    slots.push({
      page: Math.floor(pos / n),
      index,
      x: s.marginLeft + col * (s.labelWidth + s.gapX),
      y: s.marginTop + row * (s.labelHeight + s.gapY),
    });
  }
  return slots;
}

export function pageCountFor(count: number, startAt = 1, s: SheetSpec = A4_24): number {
  return count === 0 ? 0 : (labelSlots(count, startAt, s).at(-1)?.page ?? 0) + 1;
}
