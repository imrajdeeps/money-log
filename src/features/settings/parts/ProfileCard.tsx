import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { saveProfile } from '../../../data/profile.ts';
import { myUpi } from '../../../data/phonePrefs.ts';
import { cleanUpi, upiFromQr } from '../../../core/upi.ts';
import { readQrImage } from '../../../ui/qr.ts';
import { useProfile } from '../../../data/useProfile.ts';
import { COUNTRY_PREFIX, MAX_PROFILE_NAME, cleanName, initials, isIndianNumber, localDigits, normalizeWhatsapp, personLetters } from '../../../core/profile.ts';
import { Icon } from '../../../ui/Icon.tsx';
import * as ps from './partStyles.ts';
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

// The round picture with initials, the name, and what this phone holds.
function ProfileHeader({ name, email, holds }: Readonly<{ name: string; email: string | null; holds: string }>) {
  return (
    <div className="flex items-center gap-3.5">
      <span className="w-16 h-16 flex-none rounded-full bg-[#104A30] text-[#C9E96A] text-[22px] font-[750] flex items-center justify-center" aria-hidden="true">{name ? personLetters(name) : initials(name, email)}</span>
      <span className="flex flex-col min-w-0">
        <span className="text-[18px] font-bold [overflow-wrap:anywhere]">{name || tr('Your profile')}</span>
        <span className="text-[13px] text-muted [overflow-wrap:anywhere]">{holds}</span>
        {email && <span className="text-[13px] text-muted [overflow-wrap:anywhere]">{email}</span>}
      </span>
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
  const [upiRead, setUpiRead] = useState(false); // the id was just read from a QR: edged in the accent colour
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
    setUpiRead(true);
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
    setNote({ text: email ? tr('Saved. It follows you to your other devices.') : tr('Saved on this device.'), bad: false });
  }

  const goals = Object.values(app.goals).filter((g) => g.k === 'g' && !g.x).length;
  const holds = tr('This device holds {0} payments · {1} groups · {2} goals', app.entries.length, app.groups.length, goals);
  const qrBtn = ui.btn('outline', 'none', ps.outline44);
  return (
    <form className={ps.card + ' gap-3.5'} onSubmit={save} noValidate>
      <ProfileHeader name={profile.name} email={email} holds={holds} />
      <label className={ui.fieldBare}>
        <span>{tr('Name')}</span>
        <input value={name} maxLength={MAX_PROFILE_NAME} autoComplete="name" onChange={(e) => { setName(e.target.value); setNote(null); }} placeholder={tr('What others see you as in groups')} />
      </label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="profile-wa" className="text-[13px] font-semibold">{tr('WhatsApp number (optional)')}</label>
        <span className="flex items-stretch min-h-12 rounded-field border border-field-line overflow-hidden bg-card focus-within:border-accent">
          <span className="px-3 flex items-center bg-press text-[16px] font-semibold" aria-hidden="true">{COUNTRY_PREFIX}</span>
          <input id="profile-wa" className="flex-1 min-w-0 !border-0 !rounded-none px-3 bg-transparent text-[16px] focus-visible:!outline-none focus-visible:![box-shadow:none]" value={number} inputMode="tel" autoComplete="tel-national" maxLength={20} aria-label={tr('10-digit mobile number after +91')} onChange={(e) => { setNumber(e.target.value); setNote(null); }} placeholder="98765 43210" />
        </span>
        <span className={ps.small}>{tr('Used when others in a group tap Remind.')}</span>
      </div>
      {oldNumber && <p className={ui.msg('bad')} role="status">{tr('The number saved here, {0}, is not an Indian number. Only Indian numbers are accepted now: type a 10-digit number, or leave the field empty and save to remove it.', profile.whatsapp)}</p>}
      <div className="flex flex-col gap-2">
        <label htmlFor="profile-upi" className="text-[13px] font-semibold">{tr('UPI id (optional)')}</label>
        <input id="profile-upi" className={upiRead ? 'border-[1.5px] !border-accent' : undefined} value={upi} autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="name@bank" onChange={(e) => { setUpi(e.target.value); setNote(null); }} />
        <span className={ps.small}>{tr('Or read it from your UPI QR code:')}</span>
        <div className="grid grid-cols-2 gap-2">
          <label className={qrBtn}><input type="file" accept="image/*" capture="environment" onChange={(e) => void readQr(e)} /><Icon name="camera" size={18} />{tr('Scan QR')}</label>
          <label className={qrBtn}><input type="file" accept="image/*" onChange={(e) => void readQr(e)} />{tr('Upload QR image')}</label>
        </div>
        {note && <p className={note.bad ? ui.msg('bad') : 'm-0 text-[14px] leading-5 font-semibold text-good bg-good-bg px-2.5 py-2 rounded-[10px]'} role={note.bad ? 'alert' : 'status'}>{note.text}</p>}
        <span className={ps.small}>{tr('The QR image is read on this device and not kept. Group members see your UPI id when they pay you.')}</span>
      </div>
      <button type="submit" className={ui.btn('solid', 'none', ps.save)}>{tr('Save profile')}</button>
      <p className={ps.small}>{email ? tr('Your name and number are kept on this device and in your account, where only you can see them. The number is not verified, and nothing is sent to it.') : tr('Kept on this device. Sign in and your name and number also follow you to your other devices.')}</p>
    </form>
  );
}
