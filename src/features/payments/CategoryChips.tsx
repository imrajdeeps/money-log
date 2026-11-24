import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { KindCategory } from './KindCategory.tsx';
import { chipCategories } from './quickLog.ts';
import { catKey, frequentCategories } from '../../core/logic.ts';
import type { EntryKind } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Every category as a tappable chip from the very first entry, the ones this person uses most first; "More categories" holds the
// full list and the way to make a new one.
export function CategoryChips({ kind, value, onChange }: Readonly<{ kind: EntryKind; value: string; onChange: (v: string) => void }>) {
  const app = useApp();
  const isIn = kind === 'in';
  const chips = useMemo(() => {
    const names = isIn ? app.incomeCats : app.categories.map((c) => c.name);
    const canonical = new Map(names.map((n) => [catKey(n), n]));
    const used = frequentCategories(app.entries, Date.now(), 100, 90, kind).flatMap((c) => canonical.get(catKey(c)) ?? []);
    return chipCategories(names, used, value);
  }, [app.entries, app.categories, app.incomeCats, isIn, kind, value]);
  return (
    <>
      <div className={ui.chips} role="group" aria-label={tr('Category')}>
        {chips.map((c) => (
          <button key={c} type="button" className={ui.chip} aria-pressed={value === c} onClick={() => onChange(c)}>{c}</button>
        ))}
      </div>
      <details className="mt-2 text-[13px]">
        <summary className="cursor-pointer text-muted">{tr('More categories, or a new one')}</summary>
        <KindCategory kind={kind} id="log-cat" value={value} onChange={onChange} />
      </details>
    </>
  );
}
