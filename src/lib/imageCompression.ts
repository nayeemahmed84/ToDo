const MAX_DIMENSION = 1600;
const TARGET_MAX_BYTES = 260 * 1024; // ~260 KB target for Firebase free tier

const IMAGE_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'avif',
  'heic',
  'heif',
  'tiff',
  'tif',
]);

export function isSupportedImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function isHeicOrHeif(file: File): boolean {
  const type = file.type.toLowerCase();
  if (type === 'image/heic' || type === 'image/heif') return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  if (!isHeicOrHeif(file)) {
    return createImageBitmap(file);
  }
  // Try native decode first (e.g. Safari supports HEIC natively), fall back to heic2any.
  try {
    return await createImageBitmap(file);
  } catch {
    const heic2anyModule = await import('heic2any');
    const heic2any = heic2anyModule.default;
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });
    const outBlob = Array.isArray(converted) ? converted[0] : converted;
    return createImageBitmap(outBlob);
  }
}

/**
 * Decodes (including HEIC/HEIF), resizes to max 1600px, and compresses to WebP/JPEG
 * to keep Firebase Storage usage minimal on the free plan.
 */
export async function compressBackgroundImage(file: File): Promise<{
  blob: Blob;
  contentType: string;
}> {
  const bitmap = await decodeToBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize image canvas.');
    }
    ctx.drawImage(bitmap, 0, 0, width, height);

    const qualities = [0.78, 0.65, 0.52];
    const mimeCandidates = ['image/webp', 'image/jpeg'];

    for (const mime of mimeCandidates) {
      for (const q of qualities) {
        const blob = await canvasToBlob(canvas, mime, q);
        if (!blob || blob.type !== mime) break;
        if (blob.size <= TARGET_MAX_BYTES || q === qualities[qualities.length - 1]) {
          return { blob, contentType: mime };
        }
      }
    }

    const fallback = await canvasToBlob(canvas, 'image/jpeg', 0.72);
    if (!fallback) {
      throw new Error('Failed to compress image.');
    }
    return { blob: fallback, contentType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to encode image.'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read compressed image.'));
    reader.readAsDataURL(blob);
  });
}
