import { useSyncExternalStore } from 'react';
import { loadPaymentSort, subscribePaymentSort } from './paymentSort.ts';
import type { SortKey } from '../core/paymentSort.ts';

// The chosen order of payment lists, kept up to date wherever a list is shown.
export const usePaymentSort = (): SortKey => useSyncExternalStore(subscribePaymentSort, loadPaymentSort);
