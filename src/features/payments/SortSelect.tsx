import { SORT_KEYS, parseSortKey } from '../../core/paymentSort.ts';
import type { SortKey } from '../../core/paymentSort.ts';
import { savePaymentSort } from '../../data/paymentSort.ts';
import { usePaymentSort } from '../../data/usePaymentSort.ts';
import { tr } from '../../core/i18n.ts';

// The wording of each order, spelled out so tr() finds every text.
const LABEL: Record<SortKey, () => string> = {
  'date-desc': () => tr('Date, newest first'),
  'date-asc': () => tr('Date, oldest first'),
  'amount-desc': () => tr('Amount, high to low'),
  'amount-asc': () => tr('Amount, low to high'),
  category: () => tr('Category, A to Z'),
  added: () => tr('Last added first'),
};

// Picks the order of the payment lists. The choice stays on this phone and is used by every list that shows payments.
export function SortSelect() {
  const order = usePaymentSort();
  return (
    <select value={order} onChange={(e) => savePaymentSort(parseSortKey(e.target.value))} aria-label={tr('Sort payments')}>
      {SORT_KEYS.map((k) => <option key={k} value={k}>{LABEL[k]()}</option>)}
    </select>
  );
}
