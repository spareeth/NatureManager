import { describe, expect, it } from 'vitest';
import { audioExt, mediaPath } from './media';

describe('request media', () => {
  it('file extension follows the recorded audio type', () => {
    expect(audioExt('audio/webm;codecs=opus')).toBe('webm');
    expect(audioExt('audio/mp4')).toBe('m4a');
    expect(audioExt('audio/ogg')).toBe('ogg');
  });
  it('files live under the organisation and the work order', () => {
    expect(mediaPath('o1', 'w1', 'm1', 'jpg')).toBe('o1/wo/w1/m1.jpg');
  });
});
