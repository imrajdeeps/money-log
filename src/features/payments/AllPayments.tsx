import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useApp } from '../../data/context.tsx';
import { EditDialog } from './EditDialog.tsx';
import { PaymentRow } from './RecentList.tsx';
import { monthLabel } from '../../core/format.ts';
import { METHODS, fmtINR } from '../../core/logic.ts';
import type { Entry } from '../../core/logic.ts';
import { NO_FILTER, filterPayments, isFiltered, paymentCategories, paymentMonths, totalShare } from './payments.ts';
import type { PaymentFilter } from './payments.ts';

const ROW = 59; // a row is 58px tall plus the line between rows; the real height is measured once drawn

// Every payment on this phone, newest day first, with a search and filters. Only the rows near the screen are drawn,
// so a few thousand payments scroll as smoothly as twenty. The page itself does the scrolling.
export function AllPayments() {
  const app = useApp();
  const [f, setF] = useState<PaymentFilter>(NO_FILTER);
  const [editing, setEditing] = useState<Entry | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [margin, setMargin] = useState(0); // how far down the page the list starts (the filters are above it)

  const months = useMemo(() => paymentMonths(app.entries), [app.entries]);
  const categories = useMemo(() => paymentCategories(app.entries), [app.entries]);
  const rows = useMemo(() => filterPayments(app.entries, f, app.me), [app.entries, f, app.me]);
  const total = useMemo(() => totalShare(rows, app.me), [rows, app.me]);
  const set = (patch: Partial<PaymentFilter>) => setF((cur) => ({ ...cur, ...patch }));

  const hasAny = app.entries.length > 0;
  const virt = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW,
    overscan: 8,
    scrollMargin: margin,
    getItemKey: (i) => rows[i]!.id,
  });
  // The list's distance from the top of the page, measured again whenever the filters above it change height.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    const measure = () => setMargin(Math.round(ul.getBoundingClientRect().top + window.scrollY));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => ro.disconnect();
  }, [hasAny, rows.length === 0]);

  if (app.entries.length === 0) return <p className="muted">No payments yet. They all appear here, with search and filters.</p>;

  return (
    <>
      <div className="payfilters">
        <input type="search" value={f.q} onChange={(e) => set({ q: e.target.value })} placeholder="Search note, category or amount" aria-label="Search payments" enterKeyHint="search" autoComplete="off" />
        <div className="payselects">
          <select value={f.month} onChange={(e) => set({ month: e.target.value })} aria-label="Month">
            <option value="">Any month</option>
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <select value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Category">
            <option value="">Any category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={f.method} onChange={(e) => set({ method: e.target.value })} aria-label="Method">
            <option value="">Any method</option>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <p className="muted small" role="status">
          {rows.length} {rows.length === 1 ? 'payment' : 'payments'} · {fmtINR(total)}
          {isFiltered(f) && <> · <button type="button" className="linkbtn" onClick={() => setF(NO_FILTER)}>Clear filters</button></>}
        </p>
      </div>
      {rows.length === 0 && <p className="muted">Nothing matches. Try fewer words or clear the filters.</p>}
      <ul ref={listRef} className="list virtual" style={{ height: rows.length === 0 ? 0 : virt.getTotalSize(), display: rows.length === 0 ? 'none' : undefined }}>
        {virt.getVirtualItems().map((v) => (
          <li key={v.key} data-index={v.index} ref={virt.measureElement} style={{ transform: `translateY(${v.start - virt.options.scrollMargin}px)` }}>
            <PaymentRow entry={rows[v.index]!} onOpen={setEditing} />
          </li>
        ))}
      </ul>
      {editing && <EditDialog key={editing.id} entry={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
