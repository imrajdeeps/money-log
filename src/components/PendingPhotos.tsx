import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { shrinkImage } from '../photo.ts';
import { TakePhoto } from './TakePhoto.tsx';
import { MAX_PHOTOS, sizeText } from '../receipts.ts';

// Photos chosen while a payment is being logged, before it is saved (they are attached to it when it is).
export function PendingPhotos({ photos, onChange }: { photos: Blob[]; onChange: (next: Blob[]) => void }) {
  const urls = useMemo(() => photos.map((p) => URL.createObjectURL(p)), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const room = MAX_PHOTOS - photos.length;

  async function add(chosen: Blob[]) {
    const files = chosen.slice(0, room);
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      onChange([...photos, ...(await Promise.all(files.map((f) => shrinkImage(f))))]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function pickFiles(ev: ChangeEvent<HTMLInputElement>) {
    const files = [...(ev.target.files ?? [])];
    ev.target.value = '';
    void add(files);
  }

  return (
    <div className="photostrip">
      <p className="fieldlabel">Receipt photo (optional)</p>
      <div className="thumbs">
        {photos.map((p, i) => (
          <span key={urls[i]} className="thumb">
            <img src={urls[i]} alt={`Photo ${i + 1}, ${sizeText(p.size)}`} />
            <button type="button" className="thumbx" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}>✕</button>
          </span>
        ))}
        {room > 0 && (
          <>
            <TakePhoto busy={busy} onPicked={(files) => void add(files)} />
            <label className={`btn ghost addphoto${busy ? ' disabled' : ''}`}>
              Choose photo
              <input type="file" accept="image/*" multiple onChange={pickFiles} disabled={busy} />
            </label>
          </>
        )}
      </div>
      {error && <p className="msg bad" role="alert">{error}</p>}
    </div>
  );
}
