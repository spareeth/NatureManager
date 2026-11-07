import { describe, expect, it } from 'vitest';
import { linkErrorFrom } from '../auth/linkError';

describe('sign-in link errors', () => {
  it('recognises an expired or used link', () => {
    expect(
      linkErrorFrom(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe('expired');
  });
  it('other link errors and no error', () => {
    expect(linkErrorFrom('', '?error=server_error&error_code=unexpected_failure')).toBe('failed');
    expect(linkErrorFrom('#access_token=abc&type=magiclink')).toBeNull();
    expect(linkErrorFrom('')).toBeNull();
  });
});
