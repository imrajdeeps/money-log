import { useEffect, useRef } from 'react';
import * as ui from '../../ui/styles.ts';

// What to do with one category of the Month page: set its budget, or add an expense that already has this category.
export function CategoryActions({ category, onBudget, onAddExpense, onClose }: { category: string; onBudget: () => void; onAddExpense: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      onClose={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onClick={(e) => { if (e.target === ref.current) close(); }}
      aria-labelledby="category-actions-title"
    >
      <h2 id="category-actions-title">{category}</h2>
      <p className="text-muted text-[13px]">What would you like to do with this category?</p>
      <button type="button" className={ui.btn('solid', 'md', 'w-full mt-2.5')} onClick={() => { close(); onBudget(); }}>Set budget</button>
      <button type="button" className={ui.btn('ghost', 'md', 'w-full mt-2.5')} onClick={() => { close(); onAddExpense(); }}>Add expense</button>
      <button type="button" className={ui.btn('ghost', 'md', 'w-full mt-2.5')} onClick={close}>Cancel</button>
    </dialog>
  );
}
