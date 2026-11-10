// What Supabase puts after the # when someone opens a link from one of its emails. Pure, like logic.ts.
// The app only uses one kind: the "reset your password" link. It arrives as
//   https://site/#access_token=...&refresh_token=...&expires_in=3600&token_type=bearer&type=recovery
// and a link that failed arrives as
//   https://site/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
// The caller removes the fragment from the address bar as soon as it has been read, so tokens are not left in the history.
export type AuthLink =
  | { kind: 'recovery'; accessToken: string; refreshToken: string; expiresIn: number }
  | { kind: 'error'; message: string }
  | { kind: 'other'; type: string }; // a link of a kind this app does not use (a sign-in link, an invitation, ...)

const TOKEN = /^[A-Za-z0-9._~-]{10,4096}$/; // JWTs and Supabase refresh tokens use these characters only

export function parseAuthHash(hash: string): AuthLink | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw.includes('=')) return null;
  const p = new URLSearchParams(raw);

  if (p.has('error') || p.has('error_code')) {
    const code = p.get('error_code') ?? '';
    if (code === 'otp_expired') return { kind: 'error', message: 'That link has expired or was already used. Ask for a new one.' };
    const text = (p.get('error_description') ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return { kind: 'error', message: text ? `That link did not work: ${text}.` : 'That link did not work. Ask for a new one.' };
  }

  const access = p.get('access_token');
  if (access === null) return null; // not a Supabase link: leave the hash to whoever else uses it (the group join links)
  const type = (p.get('type') ?? '').slice(0, 30);
  const refresh = p.get('refresh_token') ?? '';
  if (type !== 'recovery') return { kind: 'other', type };
  if (!TOKEN.test(access) || !TOKEN.test(refresh)) return { kind: 'error', message: 'That link looks damaged. Ask for a new one.' };
  const n = Number(p.get('expires_in'));
  return { kind: 'recovery', accessToken: access, refreshToken: refresh, expiresIn: Number.isFinite(n) && n > 0 && n <= 604800 ? Math.floor(n) : 3600 };
}
