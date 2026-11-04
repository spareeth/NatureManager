/** Code from a scanned QR or barcode: our label URLs https://<host>/q/<qr_code> (permanent QR code) and
 *  https://<host>/a/<tag> (older labels) give the code; anything else is
 *  taken as a tag or an existing Code 128 barcode as printed. */
export function parseScan(text: string): string {
  const raw = text.trim();
  const m = /\/[aq]\/([^/?#\s]+)/.exec(raw);
  const tag = m?.[1];
  if (tag && /^https?:\/\//i.test(raw)) {
    try {
      return decodeURIComponent(tag);
    } catch {
      return tag;
    }
  }
  return raw;
}
