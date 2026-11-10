// Turns a picture from the camera or photo library into a small JPEG for a receipt. Browser only (it draws on a canvas).
//
// The picture is re-drawn at most 1,600 pixels on its longest side and saved again as JPEG, which also drops everything
// the original file carried besides the pixels (location, camera, time): only the picture itself is ever uploaded.
import { MAX_BYTES, MAX_SIDE, fitWithin } from '../../core/receipts.ts';

const unreadable = () => new Error('That picture could not be read. Try a JPEG or PNG photo.');

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export async function shrinkImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); // upright, whatever way the phone was held
  } catch {
    try { bitmap = await createImageBitmap(file); } catch { throw unreadable(); }
  }
  try {
    let scale = 1;
    for (let round = 0; round < 3; round++) {
      const { width, height } = fitWithin(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), MAX_SIDE);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw unreadable();
      ctx.fillStyle = '#ffffff'; // a transparent PNG becomes white, not black
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);
      for (const q of [0.82, 0.7, 0.55, 0.4]) {
        const blob = await toJpeg(canvas, q);
        if (!blob) throw unreadable();
        if (blob.size <= MAX_BYTES) return blob;
      }
      scale *= 0.7; // still over 1 MB at the lowest quality: draw it smaller
    }
  } finally {
    bitmap.close();
  }
  throw new Error('That picture is too detailed to shrink to 1 MB. Try another one.');
}
