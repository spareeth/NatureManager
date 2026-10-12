import { describe, expect, it } from 'vitest';
import { parseScan } from './scan';

describe('parseScan', () => {
  it('takes the tag from our label URL', () => {
    expect(parseScan('https://garden.example.org/a/WG07-T04_PRO')).toBe('WG07-T04_PRO');
    expect(parseScan('http://localhost:5173/a/EG%2001?x=1')).toBe('EG 01');
  });
  it('keeps a plain tag or barcode as printed', () => {
    expect(parseScan('  0012345678 ')).toBe('0012345678');
    expect(parseScan('WG07-T04_PRO')).toBe('WG07-T04_PRO');
  });
});
