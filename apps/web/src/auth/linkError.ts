/** Error that Supabase puts in the address when a sign-in link fails (#error_code=otp_expired ...). */
export function linkErrorFrom(hash: string, search = ''): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const q = new URLSearchParams(search);
  const code = params.get('error_code') ?? q.get('error_code');
  const err = params.get('error') ?? q.get('error');
  if (!code && !err) return null;
  return code === 'otp_expired' ? 'expired' : 'failed';
}
