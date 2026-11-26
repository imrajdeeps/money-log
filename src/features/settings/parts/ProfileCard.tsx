import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { saveProfile } from '../../../data/profile.ts';
import { myUpi } from '../../../data/phonePrefs.ts';
import { cleanUpi, upiFromQr } from '../../../core/upi.ts';
import { readQrImage } from '../../../ui/qr.ts';
import { useProfile } from '../../../data/useProfile.ts';
import { COUNTRY_PREFIX, MAX_PROFILE_NAME, cleanName, initials, isIndianNumber, localDigits, normalizeWhatsapp } from '../../../core/profile.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

type ProfileCheck = { ok: true; whatsapp: string; upi: string } | { ok: false; error: string };

// What was typed in the profile, checked: the WhatsApp number must be Indian, the UPI id (if any) must look like one.
function checkProfileForm(number: string, upi: string): ProfileCheck {
  const n = normalizeWhatsapp(number);
  if (!n.ok) return { ok: false, error: n.error };
  if (upi.trim() !== '' && cleanUpi(upi) === '') return { ok: false, error: tr('That does not look like a UPI id (name@bank).') };
  return { ok: true, whatsapp: n.value, upi: cleanUpi(upi) };
}

// One figure under "This phone holds".
function Stat({ value, label }: Readonly<{ value: number; label: string }>) {
  return (
    <div className="flex-1 text-center">
      <p className="text-[22px] font-bold m-0 tabular-nums">{value}</p>
      <p className="text-muted text-[13px] m-0">{label}</p>
    </div>
  );
}

// The round picture with initials, the name and the account's email (or that it is not signed in).
function ProfileHeader({ name, email }: Readonly<{ name: string; email: string | null }>) {
  return (
    <div className="flex items-center gap-3.5 mb-1">
      <div className="w-16 h-16 flex-none rounded-[50%] bg-primary text-primary-ink text-[24px] font-bold flex items-center justify-center [box-shadow:inset_0_0_0_1px_var(--primary-ring)]" aria-hidden="true">
        {initials(name, email)}
      </div>
      <div className="min-w-0">
        <h2 className="m-0 [overflow-wrap:anywhere]">{name || tr('Your profile')}</h2>
        <p className="text-muted text-[13px] m-0 [overflow-wrap:anywhere]">{email ?? tr('Not signed in: this phone only')}</p>
      </div>
    </div>
  );
}

// Who this phone belongs to: a round picture with initials, the name (it fills "your name in this group"), the email of the
// account, an optional Indian WhatsApp number (+91 is fixed, the person types 10 digits), and what this phone holds. Signed in,
// the name and number are kept in the account too and follow the person to another phone; the number is not verified and
// nothing is sent to it.
export function ProfileCard() {
  const app = useApp();
  const profile = useProfile();
  const email = app.sync.email;
  const [name, setName] = useState(profile.name);
  const [number, setNumber] = useState(localDigits(profile.whatsapp));
  const [upi, setUpi] = useState(myUpi.load());
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const oldNumber = profile.whatsapp !== '' && !isIndianNumber(profile.whatsapp); // saved before only Indian numbers were allowed

  // Scan QR (the camera) or Upload QR image: the browser reads the code, and a UPI payment code fills the id; nothing is kept.
  async function readQr(ev: ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = '';
    if (!file) return;
    const read = await readQrImage(file);
    if (!read.ok && read.reason === 'unsupported') return setNote({ text: tr('This browser cannot read QR codes. Type the UPI id instead.'), bad: true });
    const found = read.ok ? upiFromQr(read.text) : null;
    if (!found) return setNote({ text: tr('That image has no UPI QR code in it. Try another, or type the id.'), bad: true });
    setUpi(found.upi);
    setNote({ text: found.name ? tr('Read from your QR: {0} ({1}). Check it, then tap Save profile.', found.upi, found.name) : tr('Read from your QR: {0}. Check it, then tap Save profile.', found.upi), bad: false });
  }

  function save(ev: FormEvent) {
    ev.preventDefault();
    const checked = checkProfileForm(number, upi);
    if (!checked.ok) return setNote({ text: checked.error, bad: true });
    myUpi.save(checked.upi);
    saveProfile({ name: cleanName(name), whatsapp: checked.whatsapp });
    setName(cleanName(name));
    setNumber(localDigits(checked.whatsapp));
    setNote({ text: email ? tr('Saved. It follows you to your other phones.') : tr('Saved on this phone.'), bad: false });
  }

  return (
    <div className={ui.card()}>
      <ProfileHeader name={profile.name} email={email} />

      <form onSubmit={save} noValidate>
        <label className={ui.field}>
          <span>{tr('Your name')}</span>
          <input value={name} maxLength={MAX_PROFILE_NAME} autoComplete="name" onChange={(e) => { setName(e.target.value); setNote(null); }} placeholder={tr('What others see you as in groups')} />
        </label>
        <div className={ui.field}>
          <span>{tr('WhatsApp number (optional)')}</span>
          <div className="flex gap-2">
            <span className="inline-flex min-h-12 flex-none items-center rounded-xl border border-line bg-card px-3.5 font-semibold" aria-hidden="true">{COUNTRY_PREFIX}</span>
            <input value={number} inputMode="tel" autoComplete="tel-national" maxLength={20} aria-label={tr('10-digit mobile number after +91')} onChange={(e) => { setNumber(e.target.value); setNote(null); }} placeholder="98765 43210" />
          </div>
        </div>
        <label className={ui.field}>
          <span>{tr('Your UPI id (optional)')}</span>
          <input value={upi} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="name@bank" onChange={(e) => { setUpi(e.target.value); setNote(null); }} />
        </label>
        <p className="text-muted text-[13px] mt-2 mb-1.5">{tr('Or read it from your UPI QR code. The photo is read on this phone and not kept.')}</p>
        <div className="flex gap-2">
          <label className={ui.btn('ghost', 'none', 'flex-1 min-h-11 px-3 text-[14px]')}>
            <input type="file" accept="image/*" capture="environment" onChange={(e) => void readQr(e)} />
            {tr('Scan QR')}
          </label>
          <label className={ui.btn('ghost', 'none', 'flex-1 min-h-11 px-3 text-[14px]')}>
            <input type="file" accept="image/*" onChange={(e) => void readQr(e)} />
            {tr('Upload QR image')}
          </label>
        </div>
        <p className="text-muted text-[13px]">{tr('Kept on this phone only. It goes out only inside a reminder you send from a group or from Udhaar, so people can pay you.')}</p>
        {oldNumber && <p className={ui.msg('bad')} role="status">{tr('The number saved here, {0}, is not an Indian number. Only Indian numbers are accepted now: type a 10-digit number, or leave the field empty and save to remove it.', profile.whatsapp)}</p>}
        <p className="text-muted text-[13px]">{email ? tr('Kept on this phone and in your account, where only you can see it. It is not verified, and nothing is sent to it.') : tr('Kept on this phone. Sign in and it also follows you to your other phones. It is not verified, and nothing is sent to it.')}</p>
        {note && <p className={ui.msg(note.bad ? 'bad' : 'good')} role={note.bad ? 'alert' : 'status'}>{note.text}</p>}
        <button type="submit" className={ui.btn('solid', 'md', 'w-full mt-1.5')}>{tr('Save profile')}</button>
      </form>

      <h3 className="text-[16px] mt-5 mb-2">{tr('This phone holds')}</h3>
      <div className="flex gap-2 border border-line rounded-xl py-3">
        <Stat value={app.entries.length} label="payments" />
        <Stat value={app.groups.length} label="groups" />
        <Stat value={Object.values(app.goals).filter((g) => g.k === 'g' && !g.x).length} label="goals" />
      </div>
    </div>
  );
}
