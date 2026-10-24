import { db } from '../offline/db';
import { signedPhoto } from './api';

/** A photo still on the phone (not yet synced) shows from the offline store; others by signed URL. */
export async function photoUrl(path: string | null, blobId?: string) {
  if (blobId) {
    const b = await db.blobs.get(blobId);
    if (b) return URL.createObjectURL(b.blob);
  }
  return path ? signedPhoto('photos', path) : null;
}
