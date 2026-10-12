/** Code from a scanned QR or barcode: our label URL https://<host>/a/<tag> gives the tag; anything else is
 *  taken as a tag or an existing Code 128 barcode as printed. */
export function parseScan(text: string): string {
  const raw = text.trim();
  const m = /\/a\/([^/?#\s]+)/.exec(raw);
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
