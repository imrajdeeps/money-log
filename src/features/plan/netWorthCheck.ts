import { fmtINR } from '../../core/logic.ts';
import { tr } from '../../core/i18n.ts';

// ₹0 after a figure that was not, or one far from the last, is asked about once before it is saved (the owner once typed a ₹0 by
// mistake). Typing a new figure on Plan and changing one in the history ask the same way.
export function checkText(kind: 'zero' | 'jump', last: number): string {
  return kind === 'zero' ? tr('That is ₹0. Your last figure was {0}. Save ₹0 anyway?', fmtINR(last)) : tr('That is far from your last figure, {0}. Check it, or save it anyway.', fmtINR(last));
}
