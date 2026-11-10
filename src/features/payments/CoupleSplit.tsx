import { COUPLE_CHOICES, coupleChoiceOf, coupleLabel, coupleSetting, coupleSummary } from '../../core/couple.ts';
import type { Member } from '../../core/groups.ts';
import type { SplitState } from './SplitEditor.tsx';
import * as ui from '../../ui/styles.ts';

// Add expense in a Couple group: one tap says who paid and who owes, instead of the full split editor.
export function CoupleSplit({ people, me, total, value, onChange }: { people: Member[]; me: string; total: number; value: SplitState; onChange: (next: SplitState) => void }) {
  const partner = people.find((m) => m.user_id !== me);
  if (!partner) return null;
  const name = partner.display_name;
  const choice = coupleChoiceOf(value.paidBy, value.included, me, partner.user_id);
  return (
    <div className="split couplesplit">
      <fieldset className={ui.chips}>
        <legend>Who paid, and who owes</legend>
        {COUPLE_CHOICES.map((c) => (
          <button key={c} type="button" className={ui.chip} aria-pressed={choice === c} onClick={() => onChange({ ...value, mode: 'equal', ...coupleSetting(c, me, partner.user_id) })}>
            {coupleLabel(c, name)}
          </button>
        ))}
      </fieldset>
      {choice && total > 0 && <p className="text-muted text-[13px]" role="status">{coupleSummary(choice, total, me, partner.user_id, name)}.</p>}
    </div>
  );
}
