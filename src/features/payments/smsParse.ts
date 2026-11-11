// Reads a bank or UPI payment message (the text of an SMS or app alert) into the pieces of a payment. Pure text work: no
// DOM, no storage, no network, so the browser and the Node test runner share this file. The text never leaves the phone.
//
// It is built for the common Indian formats ("Rs 450.00 debited from A/c XX1234 ... UPI Ref 4012..."), not for one bank. What
// it cannot read it says so (see `problem`), so a miss is never a silently wrong payment.
import { METHODS, catKey, parseAmount } from '../../core/logic.ts';
import type { EntryKind, Method } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

export interface ParsedMessage {
  kind: EntryKind; // 'in' for a message about money received (credited, refund, cashback)
  incomeCategory: string | null; // for money in: the built-in income category the words point to (refund, cashback, salary, interest)
  amount: number;
  merchant: string | null;
  date: string | null; // YYYY-MM-DD, null = not in the message (today)
  method: Method | null;
  ref: string | null; // the bank's reference number, used to notice the same message pasted twice
}

export type MessageResult = { ok: true; payment: ParsedMessage } | { ok: false; problem: string };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const OUT = /\b(debited|spent|paid|payment of|purchase|withdrawn|withdrawal|sent|dr)\b/i;
const IN = /\b(credited|received|deposited|refund(?:ed)?|cr)\b/i;
const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

export function findDate(text: string, today: string): string | null {
  const year = (y: number) => (y < 100 ? 2000 + y : y);
  let iso: string | null = null;
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) iso = validDate(+m[1]!, +m[2]!, +m[3]!);
  if (!iso && (m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text))) iso = validDate(year(+m[3]!), +m[2]!, +m[1]!); // day first
  if (!iso && (m = /\b(\d{1,2})[- ]?([A-Za-z]{3})[a-z]*[- ,.]*(\d{2,4})\b/.exec(text))) {
    const mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
    if (mo) iso = validDate(year(+m[3]!), mo, +m[1]!);
  }
  return iso && iso <= today ? iso : null; // a date that has not happened yet is not trusted
}

// The first amount that is not a balance or a limit.
function findAmount(text: string): number | null {
  const re = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (/(bal|balance|available|avl|limit|outstanding|due)\W*(?:is|:|-)?\s*$/.test(before)) continue;
    const amt = parseAmount(m[1]!.replace(/,/g, ''));
    if (amt !== null) return amt;
  }
  return null;
}

const tidy = (s: string): string =>
  s.replace(/[_*]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[.,;:\-]+$/, '').trim()
    .toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

function findMerchant(text: string): string | null {
  // UPI/DR/412345678901/SWIGGY/... and UPI-412345678901-SWIGGY
  let m = /UPI[/-](?:DR|CR)?[/-]?\d{6,}[/-]([A-Za-z0-9 &.*_]{2,40})/i.exec(text);
  if (m) return tidy(m[1]!);
  // a UPI address: swiggy@icici -> Swiggy
  m = /\b(?:to|at|vpa|paid to)\s+(?:vpa\s+)?([A-Za-z0-9._-]{2,40})@[A-Za-z0-9]+/i.exec(text);
  if (m) return tidy(m[1]!.replace(/[.\-_]?\d{5,}$/, ''));
  m = /\b(?:at|to|towards|merchant|info:?)\s+([A-Za-z0-9][A-Za-z0-9 &.'*_-]{1,40}?)(?=\s+(?:on|via|using|ref|from|upi|txn|trf|with|for|avl|bal|if)\b|[.,;(]|\s*$)/i.exec(text);
  if (m && !/^(?:your|a\/c|ac|acct|account|bank|card)\b/i.test(m[1]!)) return tidy(m[1]!);
  return null;
}

// Money in names who it came from after "from" ("credited ... from rahul@okaxis", "received from Acme Pvt Ltd").
function findSender(text: string): string | null {
  const m = /\bfrom\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9 &.'*_-]{1,40}?)(?=@|\s+(?:on|via|using|ref|upi|txn|trf|with|for|avl|bal|a\/c|ac)\b|[.,;(]|\s*$)/i.exec(text);
  if (!m || /^(?:your|a\/c|ac|acct|account|bank|card)\b/i.test(m[1]!)) return null;
  return tidy(m[1]!.replace(/[.\-_]?\d{5,}$/, ''));
}

// The words that point to one of the built-in income categories; null when none does (the person picks).
const INCOME_HINTS: readonly (readonly [RegExp, string])[] = [
  [/\brefund(?:ed)?\b|\breversal\b|\breversed\b/i, 'Refund'],
  [/\bcash ?back\b/i, 'Cashback'],
  [/\bsalary\b|\bsal\b|\bpayroll\b/i, 'Salary'],
  [/\binterest\b|\bdividend\b/i, 'Interest & dividends'],
];
export const incomeHint = (text: string): string | null => INCOME_HINTS.find(([re]) => re.test(text))?.[1] ?? null;

function findMethod(text: string): Method | null {
  const t = text.toLowerCase();
  let m: Method | null = null;
  if (/\bupi\b|@[a-z]{2,}\b|\bvpa\b|\bimps\b|\bneft\b/.test(t)) m = 'UPI';
  if (/\b(?:debit|credit)?\s*card\b|\bpos\b|\bxx\d{4}\b.*\bcard\b/.test(t) && !/\bupi\b/.test(t)) m = 'Card';
  if (/\batm\b|\bcash withdrawal\b|\bcash\b/.test(t)) m = 'Cash';
  return m && (METHODS as readonly string[]).includes(m) ? m : null;
}

function findRef(text: string): string | null {
  const m = /\b(?:ref(?:erence)?(?:\s*(?:no|number|id))?|rrn|utr|txn\s*id|txn\s*no)\W{0,3}([A-Za-z0-9]{6,})/i.exec(text);
  return m ? m[1]!.toUpperCase() : null;
}

export function parseMessage(raw: string, today: string): MessageResult {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false, problem: tr('Paste a payment message first.') };
  if (/\b(?:otp|one[- ]time password|verification code|do not share)\b/i.test(text) && !/debited|spent|paid/i.test(text)) {
    return { ok: false, problem: tr('That looks like a one-time password, not a payment. Nothing was filled in.') };
  }
  const amount = findAmount(text);
  if (amount === null) return { ok: false, problem: tr('No amount found in that message. Type the payment in below.') };
  const out = OUT.exec(text);
  const into = IN.exec(text);
  const kind: EntryKind = into && (!out || into.index < out.index) ? 'in' : 'out';
  const merchant = kind === 'in' ? (findSender(text) ?? findMerchant(text)) : findMerchant(text);
  const incomeCategory = kind === 'in' ? incomeHint(text) : null;
  return { ok: true, payment: { kind, incomeCategory, amount, merchant, date: findDate(text, today), method: findMethod(text), ref: findRef(text) } };
}

// ---------------------------------------------------------------- the note, and noticing the same message twice
export function noteFor(p: ParsedMessage): string {
  return [p.merchant, p.ref ? `ref ${p.ref}` : null].filter(Boolean).join(' · ').slice(0, 200);
}

export function alreadyAdded(entries: readonly { note: string; deleted_at: string | null }[], ref: string | null): boolean {
  return ref !== null && entries.some((e) => e.deleted_at === null && e.note.toUpperCase().includes(ref));
}

// ---------------------------------------------------------------- the category to suggest
const WORDS: [RegExp, string][] = [
  [/swiggy|zomato|restaurant|cafe|dominos|pizza|kfc|mcdonald|starbucks|eatery|dhaba|bakery/i, 'Eating out'],
  [/bigbasket|blinkit|zepto|dmart|grocer|instamart|jiomart|supermarket|vegetable|kirana/i, 'Groceries'],
  [/uber|ola\b|rapido|petrol|fuel|irctc|metro|redbus|fastag|indian oil|bharat petroleum|hpcl|shell/i, 'Transport & fuel'],
  [/electricity|bescom|msedcl|airtel|jio|vodafone|vi\b|recharge|broadband|gas|water bill|postpaid|tata power/i, 'Bills'],
  [/amazon|flipkart|myntra|ajio|nykaa|meesho|decathlon|croma/i, 'Shopping'],
  [/pharmacy|apollo|medplus|netmeds|pharmeasy|hospital|clinic|diagnostic|lab\b/i, 'Health'],
];

// What the person chose last time for the same merchant, else a well-known word; always a category that is in their list.
export function suggestCategory(
  merchant: string | null,
  entries: readonly { note: string; category: string; deleted_at: string | null; created_at: string }[],
  categories: readonly { name: string }[],
): string | null {
  if (!merchant) return null;
  const known = new Map(categories.map((c) => [catKey(c.name), c.name]));
  const key = merchant.toLowerCase();
  let latest: { category: string; created_at: string } | null = null;
  for (const e of entries) {
    if (e.deleted_at === null && e.note.toLowerCase().includes(key) && (!latest || e.created_at > latest.created_at)) latest = e;
  }
  const own = latest ? known.get(catKey(latest.category)) : undefined;
  if (own) return own;
  for (const [re, cat] of WORDS) if (re.test(merchant)) return known.get(catKey(cat)) ?? null;
  return null;
}
