import { describe, expect, it } from 'vitest';
import { assetUrl } from './qrPayload';

describe('QR payload', () => {
  it('is https://<host>/a/<tag>', () => {
    expect(assetUrl('WG07-T04_PRO', 'https://garden.example.org/')).toBe(
      'https://garden.example.org/a/WG07-T04_PRO',
    );
  });
  it('encodes unusual characters', () => {
    expect(assetUrl('A B/1', 'https://x.org')).toBe('https://x.org/a/A%20B%2F1');
  });
  it('defaults to the current origin', () => {
    expect(assetUrl('SG03-VLV02')).toBe(`${window.location.origin}/a/SG03-VLV02`);
  });
});
