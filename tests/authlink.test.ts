import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAuthHash } from '../src/authlink.ts';
import { joinCodeFromHash } from '../src/groups.ts';

const ACCESS = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl';
const REFRESH = 'abcdefghijkl';

test('a reset link gives the two tokens and how long they last', () => {
  const l = parseAuthHash(`#access_token=${ACCESS}&expires_in=3600&refresh_token=${REFRESH}&token_type=bearer&type=recovery`);
  assert.deepEqual(l, { kind: 'recovery', accessToken: ACCESS, refreshToken: REFRESH, expiresIn: 3600 });
  // the order of the parts does not matter, and the leading # is optional
  assert.deepEqual(parseAuthHash(`type=recovery&refresh_token=${REFRESH}&access_token=${ACCESS}`), { kind: 'recovery', accessToken: ACCESS, refreshToken: REFRESH, expiresIn: 3600 });
});

test('a missing or silly lifetime falls back to one hour', () => {
  for (const v of ['', 'abc', '-5', '0', '99999999999']) {
    const l = parseAuthHash(`#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery&expires_in=${v}`);
    assert.equal(l?.kind === 'recovery' ? l.expiresIn : null, 3600, v);
  }
  const l = parseAuthHash(`#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery&expires_in=7200`);
  assert.equal(l?.kind === 'recovery' ? l.expiresIn : null, 7200);
});

test('an expired or used link, and any other failure, become readable messages', () => {
  assert.deepEqual(parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb='),
    { kind: 'error', message: 'That link has expired or was already used. Ask for a new one.' });
  assert.deepEqual(parseAuthHash('#error=server_error&error_description=Error+sending+recovery+email'),
    { kind: 'error', message: 'That link did not work: Error sending recovery email.' });
  assert.deepEqual(parseAuthHash('#error=access_denied'), { kind: 'error', message: 'That link did not work. Ask for a new one.' });
  const long = parseAuthHash(`#error=x&error_description=${'a'.repeat(500)}`);
  assert.ok(long?.kind === 'error' && long.message.length < 200, 'a long description is cut short');
});

test('links of a kind this app does not use are named, never signed in with', () => {
  for (const type of ['magiclink', 'signup', 'invite', 'email_change', '']) {
    const l = parseAuthHash(`#access_token=${ACCESS}&refresh_token=${REFRESH}&type=${type}`);
    assert.deepEqual(l, { kind: 'other', type }, type);
  }
});

test('damaged tokens are refused, and a hash that is not a Supabase link is left alone', () => {
  assert.equal(parseAuthHash(`#access_token=short&refresh_token=${REFRESH}&type=recovery`)?.kind, 'error');
  assert.equal(parseAuthHash(`#access_token=${ACCESS}&type=recovery`)?.kind, 'error', 'no refresh token');
  assert.equal(parseAuthHash(`#access_token=${encodeURIComponent('bad token <script>')}&refresh_token=${REFRESH}&type=recovery`)?.kind, 'error');
  for (const h of ['', '#', '#top', '#join=0123456789ab', '#section=2&x=3', 'plain']) assert.equal(parseAuthHash(h), null, h);
});

test('group join links and reset links never read each other', () => {
  const join = '#join=0123456789ab';
  assert.equal(parseAuthHash(join), null);
  assert.equal(joinCodeFromHash(join), '0123456789ab');
  const reset = `#access_token=${ACCESS}&refresh_token=${REFRESH}&type=recovery`;
  assert.equal(joinCodeFromHash(reset), null);
});
