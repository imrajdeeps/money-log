// Rules for the password a person chooses, and the readable messages for what the sign-in service answers. Pure, like
// logic.ts. The service applies its own rules as well; these catch the obvious mistakes before a round trip. Supabase's
// leaked-password check is not part of the free plan, so length and a short list of the commonest choices are what is left.
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD_BYTES = 72; // the service hashes with bcrypt, which ignores everything past 72 bytes

const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', '1234567890', '12345678910', 'qwertyuiop', 'qwerty12345',
  'qwerty123456', 'iloveyou123', 'letmein1234', 'welcome1234', 'admin12345', 'abc1234567', 'abcd123456', '1q2w3e4r5t', '0987654321',
  'passw0rd123', 'changeme123', 'moneylog123', 'moneylog1234',
]);

// null when the password is acceptable, otherwise what to tell the person.
export function checkPassword(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) return `Use at most ${MAX_PASSWORD_BYTES} characters.`;
  const p = password.toLowerCase();
  const e = email.trim().toLowerCase();
  const name = e.split('@')[0] ?? '';
  if (e && (p === e || (name.length >= 4 && p.includes(name)))) return 'Do not use your email address or its name in the password.';
  if (COMMON.has(p)) return 'That password is one of the most common ones. Choose something less guessable.';
  if (new Set(password).size < 4) return 'Use a wider mix of characters.';
  return null;
}

// What to show for a failed sign-in call. The service's own wording changes between versions, so match on its codes and a
// few stable phrases, and pass anything else through.
export function authMessage(status: number, text: string): string {
  const t = text.toLowerCase();
  if (status === 429 || t.includes('rate limit') || t.includes('too many')) return 'Too many tries. Wait a few minutes and try again.';
  if (t.includes('invalid login credentials') || t.includes('invalid_credentials')) return 'The email or password is not right.';
  if (t.includes('email not confirmed') || t.includes('email_not_confirmed')) return 'Confirm your email first: open the link we sent, then sign in.';
  if (t.includes('already registered') || t.includes('already been registered') || t.includes('user_already_exists')) return 'There is already an account with this email. Sign in instead.';
  if (t.includes('signups not allowed') || t.includes('signup is disabled') || t.includes('signups are disabled')) return 'New accounts are switched off right now. Ask whoever runs this app to switch sign-ups on.';
  if (t.includes('different from the old password') || t.includes('same_password')) return 'Choose a password different from the current one.';
  if (t.includes('weak_password') || t.includes('password should') || t.includes('password is known')) return text;
  if (t.includes('not authorized') || t.includes('not authorised')) return 'The sign-in email could not be sent to this address. See the README (email setup).';
  return text;
}
