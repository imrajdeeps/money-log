import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import type { CircleMember } from '../../core/circle.ts';
import type { SharedGoal } from '../../core/sharedGoals.ts';
import { SharedGoalCard } from './SharedGoalCard.tsx';
import { SharedGoalForm } from './SharedGoalForm.tsx';
import { SharedInvitations } from './SharedInvitations.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// Why the shared goals could not be loaded, in words.
function loadProblem(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return m === 'No connection' ? tr('You are offline. Shared goals need a connection.') : tr('Shared goals are not available yet: {0}', m);
}

// What the server holds: the shared goals, your Circle (to pick people from), what went wrong if it could not be read, and a way to read it again.
function useSharedGoals(available: boolean): { goals: SharedGoal[] | null; circle: CircleMember[]; problem: string; load: () => Promise<void> } {
  const app = useApp();
  const [goals, setGoals] = useState<SharedGoal[] | null>(null);
  const [circle, setCircle] = useState<CircleMember[]>([]);
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => {
    try {
      const [g, c] = await Promise.all([app.sharedGoals.load(), app.circle().catch(() => [] as CircleMember[])]);
      setGoals(g);
      setCircle(c);
      setProblem('');
    } catch (e) {
      setProblem(loadProblem(e));
    }
  }, [app]);
  useEffect(() => { if (available) void load(); }, [available, load]);
  return { goals, circle, problem, load };
}

// Shared goals: one pot with people from your Circle. Kept by the server (needs a connection), so it sits apart from your own goals.
export function SharedGoals() {
  const app = useApp();
  const [form, setForm] = useState<'new' | SharedGoal | null>(null);
  const available = app.syncEnabled && app.sync.mode !== 'signedout' && !!app.me;
  const { goals, circle, problem, load } = useSharedGoals(available);

  const header = (
    <div className="mt-6 mb-2 flex items-center justify-between gap-3">
      <h3 className="m-0 text-[16px]">{tr('Shared goals')}</h3>
      {available && !form && !problem && <button type="button" className={ui.btn('solid', 'small')} onClick={() => setForm('new')}>{tr('New shared goal')}</button>}
    </div>
  );
  if (!available) return <section aria-label={tr('Shared goals')}>{header}<p className="text-muted text-[13px]">{tr('Shared goals live in your cloud account: sign in to make one or to see invitations.')}</p></section>;

  const mine = (goals ?? []).filter((g) => g.me === 'active');
  const invites = (goals ?? []).filter((g) => g.me === 'invited');
  const done = () => { setForm(null); void load(); };
  return (
    <section aria-label={tr('Shared goals')} id="shared-goals">
      {header}
      {problem && <p className={ui.msg('bad')} role="alert">{problem}</p>}
      {form && <SharedGoalForm key={form === 'new' ? 'new' : form.id} goal={form === 'new' ? undefined : form} circle={circle} onDone={done} />}
      <SharedInvitations invites={invites} onChanged={() => { void load(); }} />
      {goals !== null && mine.length === 0 && invites.length === 0 && !form && <p className="text-muted">{tr('No shared goals yet. Make one with people from your Circle: one target, and everyone adds their own top-ups.')}</p>}
      {mine.length > 0 && (
        <ul className={ui.list()}>
          {mine.map((g) => <SharedGoalCard key={g.id} goal={g} circle={circle} onEdit={() => setForm(g)} onChanged={() => { void load(); }} />)}
        </ul>
      )}
    </section>
  );
}
