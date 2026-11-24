import { useMemo } from 'react';
import { useApp } from '../../data/context.tsx';
import { worthAuto } from '../../data/phonePrefs.ts';
import { round2 } from '../../core/logic.ts';
import { udhaarTotals } from '../../core/udhaar.ts';
import { groupsNet } from '../../core/worth.ts';
import type { AutoLine } from '../../core/worth.ts';
import { tr } from '../../core/i18n.ts';

/** The automatic lines the person switched on, worked out now from what the app already holds (group balances, Udhaar). */
export function useAutoLines(): AutoLine[] {
  const app = useApp();
  const on = worthAuto.use();
  return useMemo(() => {
    const out: AutoLine[] = [];
    if (on.groups) out.push({ key: 'groups', label: tr('Group balances (owed to you less what you owe)'), amount: groupsNet(app.groups, app.groupEntries, app.settlements, app.me) });
    if (on.udhaar) { const t = udhaarTotals(app.goals); out.push({ key: 'udhaar', label: tr('Udhaar (lent less borrowed)'), amount: round2(t.owedToMe - t.iOwe) }); }
    return out;
  }, [on.groups, on.udhaar, app.groups, app.groupEntries, app.settlements, app.me, app.goals]);
}
