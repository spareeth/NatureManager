import { describe, expect, it, vi } from 'vitest';
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn(
      async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ),
  },
}));
import QRCode from 'qrcode';
import { buildLabelPdf, type LabelData } from './pdf';

const label = (i: number): LabelData => ({
  tag_code: `WG07-T${String(i).padStart(2, '0')}_PRO`,
  scientific_name: 'Prosopis cineraria',
  common_name: 'Ghaf',
  type_name: 'Tree',
  location_code: 'WG-07',
});

describe('buildLabelPdf', () => {
  it('makes one A4 page per 24 labels and encodes each asset URL', async () => {
    const doc = await buildLabelPdf(
      Array.from({ length: 25 }, (_, i) => label(i + 1)),
      { baseUrl: 'https://garden.example.org', compress: false },
    );
    expect(doc.getNumberOfPages()).toBe(2);
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(210);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(297);
    expect(QRCode.toDataURL).toHaveBeenCalledWith(
      'https://garden.example.org/a/WG07-T01_PRO',
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    );
    const text = doc.output();
    expect(text).toContain('WG07-T25_PRO');
    expect(text).toContain('Prosopis cineraria');
    expect(text).toContain('Ghaf');
  });

  it('honours the start position', async () => {
    const doc = await buildLabelPdf([label(1), label(2)], { startAt: 24 });
    expect(doc.getNumberOfPages()).toBe(2);
  });

  it('falls back to the type name without a taxon', async () => {
    const doc = await buildLabelPdf(
      [
        {
          tag_code: 'SG03-VLV02',
          scientific_name: null,
          common_name: null,
          type_name: 'Irrigation valve',
          location_code: 'SG-03',
        },
      ],
      { compress: false },
    );
    expect(doc.output()).toContain('Irrigation valve');
  });
});
