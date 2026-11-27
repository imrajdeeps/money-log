// Two columns of uneven blocks without a hole (version 2.0.1). Laid out in rows, a long block (Spending, a dozen categories) beside a
// short one (EMI, two) left a tall empty space under the short one. Here the blocks are cut in two at the point where the columns
// come closest in height, keeping their order: the first column holds the first blocks, so read top to bottom (or on a phone, one
// column after the other) the order is unchanged. Pure.

/** The blocks split into two columns of as equal a weight as an in-order cut allows; an empty second column is left out. */
export function splitColumns<T>(items: readonly T[], weight: (item: T) => number): T[][] {
  if (items.length < 2) return [items.slice()];
  const total = items.reduce((sum, it) => sum + weight(it), 0);
  let best = 1;
  let bestDiff = Infinity;
  let first = 0;
  for (let k = 1; k < items.length; k++) {
    first += weight(items[k - 1]!);
    const diff = Math.abs(total - 2 * first);
    if (diff < bestDiff) { bestDiff = diff; best = k; }
  }
  return [items.slice(0, best), items.slice(best)];
}
