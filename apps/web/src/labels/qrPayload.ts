// QR payload: https://<host>/a/<tag_code> so a phone camera opens the record (DATA_MODEL section 4).
// VITE_PUBLIC_BASE_URL sets the host printed on labels (the public address, not localhost).

export function publicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, '');
}

/** What a printed label encodes: https://<host>/q/<qr_code>, the permanent QR code of the asset
 *  (decision 4 Nov 2026). It never changes, even if the tag code is corrected. */
export function qrUrl(qrCode: string, base = publicBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/q/${encodeURIComponent(qrCode)}`;
}

/** Older labels and links: https://<host>/a/<tag_code> (still opens the asset). */
export function assetUrl(tag: string, base = publicBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/a/${encodeURIComponent(tag)}`;
}
