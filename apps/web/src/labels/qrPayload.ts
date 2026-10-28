// QR payload: https://<host>/a/<tag_code> so a phone camera opens the record (DATA_MODEL section 4).
// VITE_PUBLIC_BASE_URL sets the host printed on labels (the public address, not localhost).

export function publicBaseUrl(): string {
  const configured = import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined;
  return (configured || window.location.origin).replace(/\/+$/, '');
}

export function assetUrl(tag: string, base = publicBaseUrl()): string {
  return `${base.replace(/\/+$/, '')}/a/${encodeURIComponent(tag)}`;
}
