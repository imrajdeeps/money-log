// UPI ids and the messages built from them (version 1.31). Money never moves through the app: a link opens the person's own UPI app with
// the payee and amount filled in, and a reminder is a WhatsApp text. An id is kept on the phone only. Pure.
import { fmtINR } from './logic.ts';
import { tr } from './i18n.ts';

const UPI_RE = /^[a-z0-9._-]{2,64}@[a-z][a-z0-9.-]{1,30}$/;

/** A UPI id as typed ("Asha@OKAxis ", any case): trimmed and lower-cased when it has the shape name@bank, else empty. */
export function cleanUpi(v: unknown): string {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return UPI_RE.test(s) ? s : '';
}

const INSIDE = /[a-z0-9._-]{2,64}@[a-z][a-z0-9.-]{1,30}/i;

/** The UPI id in a text a person pasted (a reminder, a message): "You can pay me on UPI: asha@ybl ..." gives asha@ybl; '' when there is none. */
export function extractUpi(text: unknown): string {
  const direct = cleanUpi(text);
  if (direct) return direct;
  const m = typeof text === 'string' ? INSIDE.exec(text) : null;
  return m ? cleanUpi(m[0].replace(/[.]+$/, '')) : '';
}

const enc = (s: string): string => encodeURIComponent(s);

/** The upi://pay link: payee, name, amount (two decimals) and a note, in rupees. */
export function upiLink(p: { upi: string; name: string; amount: number; note: string }): string {
  const id = cleanUpi(p.upi);
  if (!id) return '';
  return `upi://pay?pa=${id}&pn=${enc(p.name.slice(0, 40))}&am=${p.amount.toFixed(2)}&cu=INR&tn=${enc(p.note.slice(0, 60))}`;
}

/** The WhatsApp text a person sends someone who owes them in a group; their UPI id (when they have set one) and a pay link ride in it. */
export function remindText(p: { name: string; amount: number; group: string; upi: string; payeeName: string }): string {
  const id = cleanUpi(p.upi);
  const base = tr('Hi {0}, a reminder from Money Log: you owe me {1} in "{2}".', p.name, fmtINR(p.amount), p.group);
  if (!id) return base;
  return `${base} ${tr('You can pay me on UPI: {0}', id)} ${upiLink({ upi: id, name: p.payeeName, amount: p.amount, note: p.group })}`;
}

/** The WhatsApp text for an Udhaar entry: someone who has not returned what they borrowed. */
export function udhaarRemindText(p: { name: string; amount: number; upi: string; payeeName: string }): string {
  const id = cleanUpi(p.upi);
  const base = tr('Hi {0}, a gentle reminder about the {1} I lent you.', p.name, fmtINR(p.amount));
  if (!id) return base;
  return `${base} ${tr('You can pay me on UPI: {0}', id)} ${upiLink({ upi: id, name: p.payeeName, amount: p.amount, note: tr('Money Log') })}`;
}
