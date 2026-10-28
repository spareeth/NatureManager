import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { A4_24, labelSlots, type SheetSpec } from './layout';
import { assetUrl } from './qrPayload';

export type LabelData = {
  tag_code: string;
  scientific_name: string | null;
  common_name: string | null;
  type_name: string;
  location_code: string | null;
};

const PAD = 3; // mm inside each label
const QR = 27; // mm, fits the 37 mm label height with padding

/**
 * A4 PDF of labels: QR (asset URL), tag, scientific name, common name (FR-AST-06).
 * Text uses the built-in Helvetica, which has no Arabic glyphs; Arabic names are not printed.
 */
export async function buildLabelPdf(
  labels: LabelData[],
  opts: {
    startAt?: number;
    baseUrl?: string;
    sheet?: SheetSpec;
    outlines?: boolean;
    compress?: boolean;
  } = {},
): Promise<jsPDF> {
  const sheet = opts.sheet ?? A4_24;
  const doc = new jsPDF({
    unit: 'mm',
    format: [sheet.pageWidth, sheet.pageHeight],
    compress: opts.compress ?? true,
  });
  doc.setProperties({ title: 'Terra Garden labels', creator: 'Terra Garden platform' });
  const slots = labelSlots(labels.length, opts.startAt ?? 1, sheet);
  let page = 0;

  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]!;
    const s = slots[i]!;
    while (s.page > page) {
      doc.addPage();
      page++;
    }
    if (opts.outlines) {
      doc.setDrawColor(200);
      doc.rect(s.x, s.y, sheet.labelWidth, sheet.labelHeight);
    }
    const url = assetUrl(l.tag_code, opts.baseUrl);
    const png = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 0, width: 256 });
    doc.addImage(png, 'PNG', s.x + PAD, s.y + (sheet.labelHeight - QR) / 2, QR, QR);

    const tx = s.x + PAD + QR + 2.5;
    const tw = sheet.labelWidth - (tx - s.x) - PAD;
    let ty = s.y + PAD + 4;
    doc.setFont('courier', 'bold');
    doc.setFontSize(fitSize(doc, l.tag_code, tw, 11, 7));
    doc.text(l.tag_code, tx, ty);
    ty += 5;

    const name = l.scientific_name ?? l.type_name;
    doc.setFont('helvetica', l.scientific_name ? 'italic' : 'normal');
    doc.setFontSize(8.5);
    const nameLines = (doc.splitTextToSize(name, tw) as string[]).slice(0, 3);
    doc.text(nameLines, tx, ty);
    ty += nameLines.length * 3.6;

    if (l.common_name) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text((doc.splitTextToSize(l.common_name, tw) as string[]).slice(0, 2), tx, ty);
    }
    if (l.location_code) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(90);
      doc.text(l.location_code, tx, s.y + sheet.labelHeight - PAD);
      doc.setTextColor(0);
    }
  }
  return doc;
}

/** Largest font size from max down to min (step 0.5) at which text fits the width. */
function fitSize(doc: jsPDF, text: string, width: number, max: number, min: number): number {
  for (let size = max; size > min; size -= 0.5) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= width) return size;
  }
  return min;
}
