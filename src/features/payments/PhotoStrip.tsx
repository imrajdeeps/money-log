import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { shrinkImage } from './photo.ts';
import { TakePhoto } from './TakePhoto.tsx';
import { MAX_PHOTOS, liveFor, sizeText } from '../../core/receipts.ts';
import type { Receipt } from '../../core/receipts.ts';

// The picture of one photo, loaded when it appears (from this phone, or fetched from the cloud) and released when it goes.
function usePicture(r: Receipt): { url: string | null; error: string } {
  const app = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    setError('');
    app.receiptBlob(r).then((b) => {
      if (!alive) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? (e.message === 'No connection' ? 'Offline' : e.message) : String(e)); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.uploaded_at]);
  return { url, error };
}

function Thumb({ r, mine, onOpen }: { r: Receipt; mine: boolean; onOpen: () => void }) {
  const { url, error } = usePicture(r);
  const waiting = mine && !r.uploaded_at;
  return (
    <button type="button" className="thumb" onClick={onOpen} aria-label={`Receipt photo, ${sizeText(r.bytes)}${waiting ? ', waiting to upload' : ''}`}>
      {url ? <img src={url} alt="" /> : <span className="muted small">{error || '…'}</span>}
      {waiting && <span className="thumbtag">Waiting to upload</span>}
    </button>
  );
}

function Viewer({ r, mine, onClose }: { r: Receipt; mine: boolean; onClose: () => void }) {
  const app = useApp();
  const ref = useRef<HTMLDialogElement>(null);
  const { url, error } = usePicture(r);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return (
    <dialog ref={ref} className="viewer" onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-label="Receipt photo">
      {url ? <img src={url} alt="Receipt" /> : <p className="muted">{error || 'Loading…'}</p>}
      <div className="btnrow">
        {mine && (
          <button type="button" className="btn danger" onClick={() => { if (!confirm) { setConfirm(true); return; } void app.removeReceipt(r.id).then(() => ref.current?.close()); }}>
            {confirm ? 'Tap again to delete' : 'Delete photo'}
          </button>
        )}
        <button type="button" className="btn ghost" onClick={() => ref.current?.close()}>Close</button>
      </div>
    </dialog>
  );
}

// The photos of one payment, with buttons to add more when the account may.
export function PhotoStrip({ entryId, canEdit }: { entryId: string; canEdit: boolean }) {
  const app = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photos = liveFor(app.receipts, entryId);
  const room = MAX_PHOTOS - photos.length;

  async function add(chosen: Blob[]) {
    const files = chosen.slice(0, room);
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      await app.addReceipts(entryId, await Promise.all(files.map((f) => shrinkImage(f))));
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

  if (!photos.length && !canEdit) return null;
  const shown = photos.find((p) => p.id === open);
  return (
    <div className="photostrip">
      <p className="fieldlabel">Receipt photos{photos.length ? ` (${photos.length} of ${MAX_PHOTOS})` : ''}</p>
      <div className="thumbs">
        {photos.map((r) => <Thumb key={r.id} r={r} mine={r.owner_id === app.me} onOpen={() => setOpen(r.id)} />)}
        {canEdit && room > 0 && (
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
      {canEdit && !app.me && <p className="muted small">Sign in to attach photos.</p>}
      {shown && <Viewer r={shown} mine={shown.owner_id === app.me && canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}
