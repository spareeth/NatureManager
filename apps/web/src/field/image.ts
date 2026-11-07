// Photos are compressed on the phone before upload (FR-FLD-03: longest side at most 1600 px).

export const MAX_PHOTO_PX = 1600;

/** Size that fits inside max x max, keeping the aspect ratio; never enlarges. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_PX) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** JPEG of the image scaled to fit 1600 px. Falls back to the original file if decoding fails. */
export async function compressImage(file: Blob, max = MAX_PHOTO_PX, quality = 0.8): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return file;
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height, max);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  return blob ?? file;
}
