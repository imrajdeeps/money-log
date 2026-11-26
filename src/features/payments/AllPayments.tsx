import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useApp } from '../../data/context.tsx';
import { EditDialog } from './EditDialog.tsx';
import { PaymentRow } from './RecentList.tsx';
import { SortSelect } from './SortSelect.tsx';
import { usePaymentSort } from '../../data/usePaymentSort.ts';
import { dayHeading, monthLabel } from '../../core/format.ts';
import { METHODS, fmtINR } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { NO_FILTER, filterPayments, isFiltered, paymentCategories, paymentDays, paymentMonths, totalReceived, totalShare } from './payments.ts';
import type { PaymentFilter } from './payments.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const ROW = 62; // a row is 62px tall; the real height is measured once drawn

// One thing in the list: a day's heading, or a payment (with whether it opens or closes its day's card).
type Item = { kind: 'day'; key: string; date: string; out: number; first: boolean } | { kind: 'row'; key: string; entry: Entry; top: boolean; bottom: boolean };

function listItems(rows: Entry[], byDay: boolean, me: string | null): Item[] {
  if (!byDay) return rows.map((e, i) => ({ kind: 'row', key: e.id, entry: e, top: i === 0, bottom: i === rows.length - 1 }));
  return paymentDays(rows, me).flatMap((d, di): Item[] => [
    { kind: 'day', key: `d${d.date}`, date: d.date, out: d.out, first: di === 0 },
    ...d.rows.map((e, i): Item => ({ kind: 'row', key: e.id, entry: e, top: i === 0, bottom: i === d.rows.length - 1 })),
  ]);
}

function ItemView({ item, onOpen }: Readonly<{ item: Item; onOpen: (e: Entry) => void }>) {
  if (item.kind === 'day') {
    return <div className={ui.cx('flex justify-between text-[13px] font-semibold text-muted pb-1.5', item.first ? 'pt-0' : 'pt-3.5')}><span>{dayHeading(item.date)}</span><span className="tabular-nums">{fmtINR(item.out)}</span></div>;
  }
  return (
    <div className={ui.cx('bg-card border-x border-line px-4', item.top ? 'border-t rounded-t-card' : 'border-t-0', item.bottom ? 'border-b rounded-b-card' : 'border-b-0')}>
      <PaymentRow entry={item.entry} onOpen={onOpen} first={item.top} />
    </div>
  );
}

// A filter as the design draws it: a pill with a small arrow, filled with the brand colour once something is chosen.
function PillSelect({ value, label, onChange, children }: Readonly<{ value: string; label: string; onChange: (v: string) => void; children: ReactNode }>) {
  return <select className={ui.pillSelect(value !== '')} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>{children}</select>;
}

// Every payment on this phone, in the order the person chose (newest day first until they choose another), by day, with a search and
// filters. Only the rows near the screen are drawn, so a few thousand payments scroll as smoothly as twenty. The page does the scrolling.
export function AllPayments() {
  const app = useApp();
  const [f, setF] = useState<PaymentFilter>(NO_FILTER);
  const order = usePaymentSort();
  const [editing, setEditing] = useState<Entry | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [margin, setMargin] = useState(0); // how far down the page the list starts (the filters are above it)

  const months = useMemo(() => paymentMonths(app.entries), [app.entries]);
  const categories = useMemo(() => paymentCategories(app.entries), [app.entries]);
  const rows = useMemo(() => filterPayments(app.entries, f, app.me, order), [app.entries, f, app.me, order]);
  const items = useMemo(() => listItems(rows, order === 'date-desc' || order === 'date-asc', app.me), [rows, order, app.me]);
  const total = useMemo(() => totalShare(rows, app.me), [rows, app.me]);
  const received = useMemo(() => totalReceived(rows), [rows]);
  const set = (patch: Partial<PaymentFilter>) => setF((cur) => ({ ...cur, ...patch }));
  const groups = app.groups;

  const hasAny = app.entries.length > 0;
  const virt = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => (items[i]?.kind === 'day' ? 34 : ROW),
    overscan: 8,
    scrollMargin: margin,
    getItemKey: (i) => items[i]!.key,
  });
  // The list's distance from the top of the page, measured again whenever the filters above it change height.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setMargin(Math.round(el.getBoundingClientRect().top + window.scrollY));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [hasAny, rows.length === 0]);

  if (app.entries.length === 0) return <p className="text-muted">{tr('No payments yet. They all appear here, with search and filters.')}</p>;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-2.5 items-end lg:grid-cols-[minmax(0,1fr)_240px]">
        <label className={ui.search}>
          <Icon name="search" size={18} />
          <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder={tr('Search notes, places, amounts')} aria-label={tr('Search payments')} enterKeyHint="search" autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold">{tr('Sort')}</span><SortSelect /></label>
      </div>
      <div className="flex flex-wrap gap-2">
        <PillSelect value={f.month} label={tr('Month')} onChange={(v) => set({ month: v })}>
          <option value="">{tr('All months')}</option>
          {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </PillSelect>
        <PillSelect value={f.category} label={tr('Category')} onChange={(v) => set({ category: v })}>
          <option value="">{tr('All categories')}</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </PillSelect>
        <PillSelect value={f.method} label={tr('Method')} onChange={(v) => set({ method: v })}>
          <option value="">{tr('All methods')}</option>
          {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
        </PillSelect>
        {groups.length > 0 && (
          <PillSelect value={f.group ?? ''} label={tr('Group')} onChange={(v) => set({ group: v })}>
            <option value="">{tr('All groups')}</option>
            <option value="private">{tr('Not in a group')}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </PillSelect>
        )}
      </div>
      <div className="flex justify-between items-baseline gap-3 text-[14px]" role="status">
        <span className="text-muted">
          {f.month ? tr('{0} payments in {1}', rows.length, monthLabel(f.month).split(' ')[0]) : tr('{0} payments', rows.length)}
          {isFiltered(f) && <> · <button type="button" className={ui.linkBtn} onClick={() => setF(NO_FILTER)}>{tr('Clear filters')}</button></>}
        </span>
        <strong className="text-right tabular-nums">{received > 0 ? tr('{0} spent · {1} received', fmtINR(total), fmtINR(received)) : tr('{0} spent', fmtINR(total))}</strong>
      </div>
      {rows.length === 0 && <p className="text-muted">{tr('Nothing matches. Try fewer words or clear the filters.')}</p>}
      <div ref={listRef} className="relative" style={{ height: rows.length === 0 ? 0 : virt.getTotalSize(), display: rows.length === 0 ? 'none' : undefined }}>
        {virt.getVirtualItems().map((v) => (
          <div key={v.key} data-index={v.index} ref={virt.measureElement} className="absolute top-0 left-0 w-full" style={{ transform: `translateY(${v.start - virt.options.scrollMargin}px)` }}>
            <ItemView item={items[v.index]!} onOpen={setEditing} />
          </div>
        ))}
      </div>
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
