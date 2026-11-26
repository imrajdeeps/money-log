// When the notification chime may play (version 2.0): only when the number of notes went up, and at most once a minute, so a burst
// of notes rings once. The sounds themselves are made in ui/sound.ts. Pure.
export const CHIME_GAP_MS = 60_000;

export function chimeDue(prevCount: number, count: number, lastChimeAt: number, now: number): boolean {
  return count > prevCount && now - lastChimeAt >= CHIME_GAP_MS;
}
