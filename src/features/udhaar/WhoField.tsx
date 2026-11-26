import { useState } from 'react';
import { circleName, sortCircle } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { catKey } from '../../core/logic.ts';
import { initials } from '../../core/profile.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const OPTION = 'w-full min-h-[52px] flex items-center gap-2.5 px-3.5 border-0 bg-transparent text-left text-ink cursor-pointer [font-family:inherit] hover:bg-press';
const AVATAR = 'w-8 h-8 flex-none rounded-full bg-press text-ink text-[12px] font-bold flex items-center justify-center';

// The people to offer for what is typed: Circle people whose name has it, and names used before (private) that are not in the Circle.
function matches(typed: string, circle: readonly CircleMember[], used: readonly string[]) {
  const q = catKey(typed);
  const inCircle = sortCircle(circle).filter((m) => m.name && (!q || catKey(m.name).includes(q))).slice(0, 6);
  const circleKeys = new Set(circle.filter((m) => m.name).map((m) => catKey(m.name)));
  const before = used.filter((n) => !circleKeys.has(catKey(n)) && (!q || catKey(n).includes(q))).slice(0, 4);
  const exact = circleKeys.has(q) || used.some((n) => catKey(n) === q);
  return { inCircle, before, offerTyped: q !== '' && !exact };
}

// "Lent to" / "Borrowed from" (version 2.0): type a name, and your Circle is offered as you type (tap one to share the entry with
// them); a name outside the Circle stays private on this phone. Names used before are offered too.
export function WhoField({ label, value, picked, circle, used, onChange, onPick }: Readonly<{
  label: string; value: string; picked: CircleMember | null; circle: readonly CircleMember[]; used: readonly string[];
  onChange: (name: string) => void; onPick: (m: CircleMember | null, name: string) => void;
}>) {
  const [open, setOpen] = useState(false);
  const m = matches(value, circle, used);
  const choose = (who: CircleMember | null, name: string) => { onPick(who, name); setOpen(false); };
  return (
    <div className={ui.field}>
      <span>{label}</span>
      <input value={value} maxLength={40} autoComplete="off" role="combobox" aria-expanded={open} aria-controls="who-options" aria-autocomplete="list"
        placeholder={circle.length > 0 ? tr('Type a name or pick from your Circle') : undefined}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onChange={(e) => { onChange(e.target.value); setOpen(true); }} />
      {open && (m.inCircle.length > 0 || m.before.length > 0 || m.offerTyped) && (
        <div id="who-options" role="listbox" aria-label={label} onMouseDown={(e) => e.preventDefault()}
          className="mt-1.5 py-1.5 bg-card border border-line rounded-[14px] [box-shadow:var(--shadow-pop)] [&>p]:m-0 [&>p]:px-3.5 [&>p]:pt-1.5 [&>p]:pb-1 [&>p]:text-[11px] [&>p]:font-semibold [&>p]:uppercase [&>p]:tracking-[0.06em] [&>p]:text-muted">
          {m.inCircle.length > 0 && <p>{tr('Your Circle')}</p>}
          {m.inCircle.map((c) => (
            <button key={c.user_id} type="button" role="option" aria-selected={picked?.user_id === c.user_id} className={OPTION} onClick={() => choose(c, circleName(c))}>
              <span className={AVATAR} aria-hidden="true">{initials(circleName(c), null)}</span>
              <span className={ui.rowMain()}><b>{circleName(c)}</b><small>{tr('In your Circle · can be shared')}</small></span>
            </button>
          ))}
          {m.before.length > 0 && <p>{tr('Used before')}</p>}
          {m.before.map((n) => (
            <button key={n} type="button" role="option" aria-selected={!picked && value === n} className={OPTION} onClick={() => choose(null, n)}>
              <span className={ui.rowMain()}><b>{n}</b><small>{tr('Private · only you see it')}</small></span>
            </button>
          ))}
          {m.offerTyped && (
            <button type="button" role="option" aria-selected={false} className={`${OPTION} border-t border-line`} onClick={() => choose(null, value.trim())}>
              <span className={ui.rowMain()}><b>{tr('Use “{0}”', value.trim())}</b><small>{tr('Not in your Circle · private, only you see it')}</small></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
