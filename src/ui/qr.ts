// Reading a QR code from a photo with the browser's own barcode reader (Chrome on Android has one): nothing is fetched, no library
// is added, and the photo is not kept. Where the browser has no reader the answer says so, and the id is typed instead (version 2.0).
type Detector = { detect: (img: ImageBitmapSource) => Promise<{ rawValue: string }[]> };
type DetectorClass = new (o: { formats: string[] }) => Detector;

export type QrRead = { ok: true; text: string } | { ok: false; reason: 'unsupported' | 'none' };

export async function readQrImage(file: Blob): Promise<QrRead> {
  const BD = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!BD) return { ok: false, reason: 'unsupported' };
  try {
    const bmp = await createImageBitmap(file);
    const codes = await new BD({ formats: ['qr_code'] }).detect(bmp);
    bmp.close();
    const text = codes.find((c) => c.rawValue)?.rawValue;
    return text ? { ok: true, text } : { ok: false, reason: 'none' };
  } catch {
    return { ok: false, reason: 'none' };
  }
}
