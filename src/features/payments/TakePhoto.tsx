import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The "Take photo" button. A phone or tablet hands the job to its own camera app (the back camera, via capture="environment").
// A computer ignores that hint and shows a file chooser instead, so there the picture is taken in the app, from the webcam.
const hasLiveCamera = (): boolean =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
  && !window.matchMedia('(pointer: coarse)').matches;

function reason(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return tr('Camera access was blocked. Allow it for this site in the browser, or use Choose photo.');
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return tr('No camera was found. Use Choose photo instead.');
  if (name === 'NotReadableError') return tr('The camera is in use by another app. Close it and try again, or use Choose photo.');
  return tr('The camera could not be opened. Use Choose photo instead.');
}

const stopStream = (s: MediaStream | null): void => { s?.getTracks().forEach((t) => t.stop()); };

// Asks for the back camera. If the dialog has gone by the time the answer comes (isAlive says no), the stream is stopped at once.
function openCamera(isAlive: () => boolean, onStream: (s: MediaStream) => void, onError: (e: unknown) => void): void {
  navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
    .then((s) => { if (isAlive()) onStream(s); else stopStream(s); })
    .catch((e: unknown) => { if (isAlive()) onError(e); });
}

// Shows the stream in the video; the shutter button waits until it plays (or fails to, which is not a reason to keep it off).
function showStream(v: HTMLVideoElement | null, s: MediaStream, onReady: () => void): void {
  if (!v) return;
  v.srcObject = s;
  void v.play().then(onReady).catch(onReady);
}

function Camera({ onShot, onClose }: Readonly<{ onShot: (photo: Blob) => void; onClose: () => void }>) {
  const dlg = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const d = dlg.current;
    if (d && !d.open) d.showModal();
    let stream: MediaStream | null = null;
    let alive = true;
    openCamera(() => alive, (s) => { stream = s; showStream(video.current, s, () => setReady(true)); }, (e) => setError(reason(e)));
    return () => { alive = false; stopStream(stream); };
  }, []);

  function snap() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')?.drawImage(v, 0, 0);
    canvas.toBlob((b) => {
      if (!b) { setError(tr('The picture could not be taken. Try again.')); return; }
      onShot(b);
      dlg.current?.close();
    }, 'image/jpeg', 0.92);
  }

  return (
    <dialog ref={dlg} className={`${ui.viewer} ${ui.camera}`} aria-label={tr('Take a receipt photo')} onClose={onClose}>
      {error ? <p className={ui.msg('bad')} role="alert">{error}</p> : <video ref={video} playsInline muted aria-label={tr('Camera view')} />}
      <div className={ui.btnRow}>
        {!error && <button type="button" className={ui.btn()} disabled={!ready} onClick={snap}>{tr('Take photo')}</button>}
        <button type="button" className={ui.btn('ghost')} onClick={() => dlg.current?.close()}>{error ? tr('Close') : tr('Cancel')}</button>
      </div>
    </dialog>
  );
}

export function TakePhoto({ busy, onPicked }: Readonly<{ busy: boolean; onPicked: (files: Blob[]) => void }>) {
  const [live] = useState(hasLiveCamera);
  const [open, setOpen] = useState(false);
  const label = busy ? 'Working…' : tr('Take photo');
  if (live) {
    return (
      <>
        <button type="button" className={ui.addPhoto(busy)} disabled={busy} onClick={() => setOpen(true)}>{label}</button>
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
    <label className={ui.addPhoto(busy)}>
      {label}
      <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={busy} />
    </label>
  );
}
