import { useState } from 'react';
import type { FormEvent } from 'react';
import { useApp } from '../../../data/context.tsx';
import { saveProfile } from '../../../data/profile.ts';
import { useProfile } from '../../../data/useProfile.ts';
import { COUNTRY_PREFIX, MAX_PROFILE_NAME, cleanName, initials, isIndianNumber, localDigits, normalizeWhatsapp } from '../../../core/profile.ts';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

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
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const oldNumber = profile.whatsapp !== '' && !isIndianNumber(profile.whatsapp); // saved before only Indian numbers were allowed

  function save(ev: FormEvent) {
    ev.preventDefault();
    const n = normalizeWhatsapp(number);
    if (!n.ok) return setNote({ text: n.error, bad: true });
    saveProfile({ name: cleanName(name), whatsapp: n.value });
    setName(cleanName(name));
    setNumber(localDigits(n.value));
    setNote({ text: email ? tr('Saved. It follows you to your other phones.') : tr('Saved on this phone.'), bad: false });
  }

  const stat = (value: number, label: string) => (
    <div className="flex-1 text-center">
      <p className="text-[22px] font-bold m-0 tabular-nums">{value}</p>
      <p className="text-muted text-[13px] m-0">{label}</p>
    </div>
  );

  return (
    <div className={ui.card()}>
      <div className="flex items-center gap-3.5 mb-1">
        <div className="w-16 h-16 flex-none rounded-[50%] bg-primary text-primary-ink text-[24px] font-bold flex items-center justify-center [box-shadow:inset_0_0_0_1px_var(--primary-ring)]" aria-hidden="true">
          {initials(profile.name, email)}
        </div>
        <div className="min-w-0">
          <h2 className="m-0 [overflow-wrap:anywhere]">{profile.name || tr('Your profile')}</h2>
          <p className="text-muted text-[13px] m-0 [overflow-wrap:anywhere]">{email ?? tr('Not signed in: this phone only')}</p>
        </div>
      </div>

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
        {oldNumber && <p className={ui.msg('bad')} role="status">{tr('The number saved here, {0}, is not an Indian number. Only Indian numbers are accepted now: type a 10-digit number, or leave the field empty and save to remove it.', profile.whatsapp)}</p>}
        <p className="text-muted text-[13px]">{email ? tr('Kept on this phone and in your account, where only you can see it. It is not verified, and nothing is sent to it.') : tr('Kept on this phone. Sign in and it also follows you to your other phones. It is not verified, and nothing is sent to it.')}</p>
        {note && <p className={ui.msg(note.bad ? 'bad' : 'good')} role={note.bad ? 'alert' : 'status'}>{note.text}</p>}
        <button type="submit" className={ui.btn('solid', 'md', 'w-full mt-1.5')}>{tr('Save profile')}</button>
      </form>

      <h3 className="text-[16px] mt-5 mb-2">{tr('This phone holds')}</h3>
      <div className="flex gap-2 border border-line rounded-xl py-3">
        {stat(app.entries.length, 'payments')}
        {stat(app.groups.length, 'groups')}
        {stat(Object.values(app.goals).filter((g) => g.k === 'g' && !g.x).length, 'goals')}
      </div>
    </div>
  );
}
