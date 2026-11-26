// Two soft sounds made in the browser (nothing is fetched): a short tick when a message (toast) appears and a two-note chime for a
// new notification (version 2.0). Quiet when the person turned "Play soft sounds" off (Settings, Appearance). A browser may keep sound
// off until the page has been tapped once; then nothing plays and nothing breaks.
import { soundsOn } from '../data/phonePrefs.ts';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!soundsOn.load()) return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

// One soft sine note that fades in over 10 ms and out by its end, at a low volume.
function tone(a: AudioContext, freq: number, start: number, length: number, peak: number) {
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = a.currentTime + start;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/** About 90 ms, for a toast (Saved, Deleted, Recorded, Settled). */
export function playTick() {
  const a = audio();
  if (a) tone(a, 1320, 0, 0.09, 0.05);
}

/** About 360 ms, two notes, for a new notification. */
export function playChime() {
  const a = audio();
  if (!a) return;
  tone(a, 880, 0, 0.18, 0.06);
  tone(a, 1175, 0.12, 0.24, 0.05);
}
