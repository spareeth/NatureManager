import { supabase } from '../lib/supabase';
import { compressImage } from '../field/image';

// Photos and voice notes on work orders (media rows; files in the private photos and audio buckets
// under <organisation_id>/wo/<work_order_id>/).

export type WoMedia = {
  id: string;
  bucket: 'photos' | 'audio';
  path: string;
  kind: 'photo' | 'audio';
  caption: string | null;
  created_at: string;
};
export type Attachments = { photos: File[]; voice: Blob | null };

/** File extension for a recorded audio type (browsers record webm, Safari mp4). */
export function audioExt(type: string): string {
  if (type.includes('mp4') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  return 'webm';
}

export const mediaPath = (orgId: string, woId: string, id: string, ext: string) =>
  `${orgId}/wo/${woId}/${id}.${ext}`;

async function put(
  orgId: string,
  woId: string,
  blob: Blob,
  kind: 'photo' | 'audio',
  caption: string | null,
) {
  const id = crypto.randomUUID();
  const bucket = kind === 'photo' ? 'photos' : 'audio';
  const type = kind === 'photo' ? 'image/jpeg' : blob.type || 'audio/webm';
  const path = mediaPath(orgId, woId, id, kind === 'photo' ? 'jpg' : audioExt(type));
  const up = await supabase.storage.from(bucket).upload(path, blob, { contentType: type });
  if (up.error) throw new Error(up.error.message);
  const { error } = await supabase.from('media').insert({
    id,
    organisation_id: orgId,
    bucket,
    path,
    kind,
    work_order_id: woId,
    taken_at: new Date().toISOString(),
    caption,
  });
  if (error) throw new Error(error.message);
}

/** Upload a request's attachments now (web, online). Photos are compressed to 1600 px. */
export async function uploadAttachments(orgId: string, woId: string, a: Attachments) {
  for (const f of a.photos) await put(orgId, woId, await compressImage(f), 'photo', null);
  if (a.voice) await put(orgId, woId, a.voice, 'audio', 'voice note');
}

export async function fetchWoMedia(woId: string): Promise<WoMedia[]> {
  const { data, error } = await supabase
    .from('media')
    .select('id, bucket, path, kind, caption, created_at')
    .eq('work_order_id', woId)
    .in('kind', ['photo', 'audio'])
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []) as WoMedia[];
}

export async function signedMediaUrl(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
