import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../../data/context.tsx';
import { EditDialog } from './EditDialog.tsx';
import { shortDate } from '../../core/format.ts';
import { fmtINR, isIncome, myShare } from '../../core/logic.ts';
import { sortPayments } from '../../core/paymentSort.ts';
import { usePaymentSort } from '../../data/usePaymentSort.ts';
import type { Entry } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The two letters on a payment's badge: "Gr" for Groceries, "Eo" for Eating out, "Tr" for Transport & fuel (a name with "&" keeps its
// first word), "In" for money received.
export function badgeLetters(category: string, income: boolean): string {
  if (income) return 'In';
  const words = category.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1 && !category.includes('&')) return (words[0]![0]! + words[1]![0]!.toLowerCase());
  const w = words[0] ?? '?';
  return w.slice(0, 1).toUpperCase() + w.slice(1, 2).toLowerCase();
}
// The badge's tint: green for food bought in and money received, amber for eating out, blue for getting about, grey for the rest
// (the design's four); any other category gets one of the four from its name, so it keeps its colour.
const TINTS = ['bg-good-bg text-good', 'bg-warn-bg text-warn', 'bg-tint-blue text-tint-blue-ink', 'bg-press text-ink'] as const;
const KNOWN: Record<string, number> = { groceries: 0, 'eating out': 1, 'transport & fuel': 2, bills: 3, rent: 3, shopping: 1, health: 2, savings: 0, 'loan emi': 3, 'family support': 0 };
export function badgeTint(category: string, income: boolean): string {
  if (income) return TINTS[0];
  const k = category.trim().toLowerCase();
  if (k in KNOWN) return TINTS[KNOWN[k]!]!;
  let h = 0;
  for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length]!;
}

// One payment as a tappable row, as on the design: a 40px badge, the note's first part as the title (the category when there is
// no note), then the category, the day (on the Overview), the method, the rest of the note and the group; the amount on the right.
export function PaymentRow({ entry: e, onOpen, showDate = false, first = false }: Readonly<{ entry: Entry; onOpen: (e: Entry) => void; showDate?: boolean; first?: boolean }>) {
  const app = useApp();
  const groupName = (id: string | null) => app.groups.find((g) => g.id === id)?.name ?? 'a group';
  const income = isIncome(e);
  const [head, ...rest] = e.note.split(' · ').map((x) => x.trim()).filter(Boolean);
  const title = head ?? e.category;
  const sub = [head ? e.category : '', showDate ? shortDate(e.entry_date) : '', e.method ?? '', ...rest,
    e.group_id ? tr('{0} · your share {1}', groupName(e.group_id), fmtINR(myShare(e, app.me))) : ''].filter(Boolean).join(' · ');
  return (
    <button type="button" className={ui.cx(PAY_ROW, first ? 'border-t-0' : 'border-t')} onClick={() => onOpen(e)}>
      <span className={ui.cx('w-10 h-10 rounded-xl flex items-center justify-center text-[13px] font-bold', badgeTint(e.category, income))} aria-hidden="true">{badgeLetters(e.category, income)}</span>
      <span className="flex flex-col min-w-0"><span className="text-[15px] font-semibold truncate">{title}</span><span className="text-[13px] text-muted truncate">{sub}</span></span>
      <span className="flex items-center gap-2">
        <span className={ui.cx('text-[16px] font-bold tabular-nums', income ? 'text-good' : '')}>{income ? '+' : ''}{fmtINR(e.group_id ? e.amount : myShare(e, app.me))}</span>
        {app.syncEnabled && app.sync.mode !== 'signedout' && app.sync.mode !== 'local' && e.dirty ? <span className={ui.dot} role="img" aria-label={tr('Waiting to sync')} /> : null}
      </span>
    </button>
  );
}
const PAY_ROW = 'w-full grid grid-cols-[40px_minmax(0,1fr)_auto] gap-3 items-center min-h-[62px] py-1.5 px-0 border-0 border-line bg-transparent text-ink text-left [font-family:inherit] [line-height:inherit] cursor-pointer';

// The first few payments in the order the person chose (newest day first until they choose another); tapping one opens it to edit or delete. The Home tile shows a few without a frame (plain).
export function RecentList({ limit, plain = false, empty }: Readonly<{ limit: number; plain?: boolean; empty: ReactNode }>) {
  const app = useApp();
  const [editing, setEditing] = useState<Entry | null>(null);
  const order = usePaymentSort();
  const recent = useMemo(() => sortPayments(app.entries, order, app.me).slice(0, limit), [app.entries, order, app.me, limit]);
  return (
    <>
      {recent.length === 0 ? empty : (
        <ul className={plain ? 'list-none m-0 p-0' : ui.list()}>
          {recent.map((e) => <li key={e.id}><PaymentRow entry={e} onOpen={setEditing} showDate /></li>)}
        </ul>
      )}
      {/* outside the list: deleting the last payment empties the list before the dialog has reported that it closed */}
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
