import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useApp } from '../../data/context.tsx';
import { shrinkImage } from './photo.ts';
import { TakePhoto } from './TakePhoto.tsx';
import { MAX_PHOTOS, liveFor, sizeText } from '../../core/receipts.ts';
import type { Receipt } from '../../core/receipts.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

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
    }).catch((e: unknown) => { if (alive) setError(e instanceof Error ? (e.message === 'No connection' ? tr('Offline') : e.message) : String(e)); });
    return () => { alive = false; if (made) URL.revokeObjectURL(made); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, r.uploaded_at]);
  return { url, error };
}

function Thumb({ r, mine, onOpen }: { r: Receipt; mine: boolean; onOpen: () => void }) {
  const { url, error } = usePicture(r);
  const waiting = mine && !r.uploaded_at;
  return (
    <button type="button" className={ui.thumb} onClick={onOpen} aria-label={tr('Receipt photo, {0}{1}', sizeText(r.bytes), waiting ? tr(', waiting to upload') : '')}>
      {url ? <img src={url} alt="" /> : <span className="text-muted text-[13px]">{error || '…'}</span>}
      {waiting && <span className={ui.thumbTag}>{tr('Waiting to upload')}</span>}
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
    <dialog ref={ref} className={ui.viewer} onClose={onClose} onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }} aria-label={tr('Receipt photo')}>
      {url ? <img src={url} alt={tr('Receipt')} /> : <p className="text-muted">{error || 'Loading…'}</p>}
      <div className={ui.btnRow}>
        {mine && (
          <button type="button" className={ui.btn('danger', 'md', 'w-full')} onClick={() => { if (!confirm) { setConfirm(true); return; } void app.removeReceipt(r.id).then(() => ref.current?.close()); }}>
            {confirm ? tr('Tap again to delete') : tr('Delete photo')}
          </button>
        )}
        <button type="button" className={ui.btn('ghost')} onClick={() => ref.current?.close()}>{tr('Close')}</button>
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
    <div className={ui.photoStrip}>
      <p className={ui.fieldLabel}>{tr('Receipt photos{0}', photos.length ? tr(' ({0} of {1})', photos.length, MAX_PHOTOS) : '')}</p>
      <div className={ui.thumbs}>
        {photos.map((r) => <Thumb key={r.id} r={r} mine={r.owner_id === app.me} onOpen={() => setOpen(r.id)} />)}
        {canEdit && room > 0 && (
          <>
            <TakePhoto busy={busy} onPicked={(files) => void add(files)} />
            <label className={ui.addPhoto(busy)}>
              {tr('Choose photo')}
              <input type="file" accept="image/*" multiple onChange={pickFiles} disabled={busy} />
            </label>
          </>
        )}
      </div>
      {error && <p className={ui.msg('bad')} role="alert">{error}</p>}
      {canEdit && !app.me && <p className="text-muted text-[13px]">{tr('Sign in to attach photos.')}</p>}
      {shown && <Viewer r={shown} mine={shown.owner_id === app.me && canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}
