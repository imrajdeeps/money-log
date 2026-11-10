import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import * as ui from '../../ui/styles.ts';

// The "Take photo" button. A phone or tablet hands the job to its own camera app (the back camera, via capture="environment").
// A computer ignores that hint and shows a file chooser instead, so there the picture is taken in the app, from the webcam.
const hasLiveCamera = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  && !window.matchMedia('(pointer: coarse)').matches;

function reason(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Camera access was blocked. Allow it for this site in the browser, or use Choose photo.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'No camera was found. Use Choose photo instead.';
  if (name === 'NotReadableError') return 'The camera is in use by another app. Close it and try again, or use Choose photo.';
  return 'The camera could not be opened. Use Choose photo instead.';
}

function Camera({ onShot, onClose }: { onShot: (photo: Blob) => void; onClose: () => void }) {
  const dlg = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    let stream: MediaStream | null = null;
    let alive = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const v = video.current;
        if (v) { v.srcObject = s; void v.play().then(() => setReady(true)).catch(() => setReady(true)); }
      })
      .catch((e: unknown) => { if (alive) setError(reason(e)); });
    return () => { alive = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, []);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (!b) { setError('The picture could not be taken. Try again.'); return; }
      onShot(b);
      dlg.current?.close();
    }, 'image/jpeg', 0.92);
  }

  return (
    <dialog ref={dlg} className="viewer camera" aria-label="Take a receipt photo" onClose={onClose}>
      {error ? <p className={ui.msg('bad')} role="alert">{error}</p> : <video ref={video} playsInline muted aria-label="Camera view" />}
      <div className={ui.btnRow}>
        {!error && <button type="button" className={ui.btn()} disabled={!ready} onClick={snap}>Take photo</button>}
        <button type="button" className={ui.btn('ghost')} onClick={() => dlg.current?.close()}>{error ? 'Close' : 'Cancel'}</button>
      </div>
    </dialog>
  );
}

export function TakePhoto({ busy, onPicked }: { busy: boolean; onPicked: (files: Blob[]) => void }) {
  const [live] = useState(hasLiveCamera);
  const [open, setOpen] = useState(false);
  const label = busy ? 'Working…' : 'Take photo';
  if (live) {
    return (
      <>
        <button type="button" className={`btn ghost addphoto${busy ? ' disabled' : ''}`} disabled={busy} onClick={() => setOpen(true)}>{label}</button>
        {open && <Camera onShot={(b) => onPicked([b])} onClose={() => setOpen(false)} />}
      </>
    );
  }
  const pick = (ev: ChangeEvent<HTMLInputElement>) => {
    const files = [...(ev.target.files ?? [])];
    ev.target.value = '';
    if (files.length) onPicked(files);
  };
  return (
    <label className={`btn ghost addphoto${busy ? ' disabled' : ''}`}>
      {label}
      <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={busy} />
    </label>
  );
}
