import { useEffect, useRef } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// What to do with one category of the Month page, as a sheet (the design's): set its budget, or add an expense in it.
export function CategoryActions({ category, line, onBudget, onAddExpense, onClose }: Readonly<{ category: string; line?: string; onBudget: () => void; onAddExpense: () => void; onClose: () => void }>) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      className="sheet"
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="category-actions-title"
    >
      <div className="flex justify-between items-center mt-2.5">
        <span className="flex flex-col"><h2 id="category-actions-title" className="m-0 text-[18px] font-bold">{category}</h2>{line && <span className="text-[13px] text-muted">{line}</span>}</span>
        <button type="button" className={ui.iconBtn} aria-label={tr('Close')} onClick={close}><Icon name="close" size={22} /></button>
      </div>
      <button type="button" className={ROW} onClick={() => { close(); onBudget(); }}>{tr('Set budget')}</button>
      <button type="button" className={ui.cx(ROW, 'border-b-0')} onClick={() => { close(); onAddExpense(); }}>{tr('Add expense in {0}', category)}</button>
    </dialog>
  );
}
const ROW = 'w-full min-h-14 mt-2 text-left border-0 border-b border-line bg-transparent text-ink text-[16px] font-semibold p-0 cursor-pointer [font-family:inherit]';
