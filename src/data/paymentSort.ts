// The order the person chose for their payment lists (localStorage; this phone only: not synced, not in the backup, no database).
// Reads and writes never throw: with the store blocked the list simply keeps its default order.
import { DEFAULT_SORT, parseSortKey } from '../core/paymentSort.ts';
import type { SortKey } from '../core/paymentSort.ts';

const KEY = 'money-log.payment-sort';
const EVENT = 'money-log:payment-sort';

export function loadPaymentSort(): SortKey {
  try {
    return parseSortKey(localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SORT;
  }
}

export function savePaymentSort(key: SortKey): void {
  try { localStorage.setItem(KEY, key); } catch { /* the choice lasts until the page is closed */ }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribePaymentSort(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
