import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../../ui/Icon.tsx';
import { shortDate } from '../../core/format.ts';
import { circleName } from '../../core/circle.ts';
import type { CircleMember } from '../../core/circle.ts';
import { useApp } from '../../data/context.tsx';
import { activeMembers, fromPaise, groupBalances } from '../../core/groups.ts';
import { groupActivity } from '../../core/groupActivity.ts';
import { groupSeen } from '../../data/phonePrefs.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { fmtINR } from '../../core/logic.ts';
import { GroupDetail } from './GroupDetail.tsx';
import { GroupSettings } from './GroupSettings.tsx';
import { CreateCard } from './CreateCard.tsx';
import { JoinCard } from './JoinCard.tsx';
import { PeopleLines } from './PeopleLines.tsx';
import { JoinInvite } from './JoinInvite.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';
import type { Group } from '../../core/groups.ts';

// groupId: the group named in the address (/groups/<id>), or none for the list. settings: that group's settings are open
// (/groups/<id>/settings). onOpen(id) goes to a group, onOpen(id, true) to its settings, onOpen() to the list.
export function GroupsScreen({ groupId, settings = false, onOpen, openSettings, openCircle, openUdhaar, onAdd }: Readonly<{ groupId?: string; settings?: boolean; onOpen: (id?: string, settings?: boolean) => void; openSettings: () => void; openCircle: () => void; openUdhaar: () => void; onAdd: (id: string) => void }>) {
  const app = useApp();
  const open = groupId ? app.groups.find((g) => g.id === groupId.toLowerCase()) : undefined;
  const seen = groupSeen.use();
  const [creating, setCreating] = useState(false);
  // An invitation arrived (a tapped link): go back to the list, where the join form is.
  useEffect(() => { if (app.joinCode && groupId) onOpen(); }, [app.joinCode, groupId, onOpen]);

  const titled = (node: ReactNode) => <section className="flex flex-col gap-4"><h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Groups')}</h2>{node}</section>;
  if (!app.syncEnabled) {
    return titled(<div className={ui.card('notice')}><p><strong>{tr('Groups need cloud sync.')}</strong>{' '}{tr('It is not set up in this build, so payments stay on this device only. The README explains how to turn it on.')}</p></div>);
  }
  if (app.sync.mode === 'signedout' || !app.me) {
    if (app.joinCode) return <JoinInvite />; // an invitation link: the way in is on this screen
    return titled(
      <div className={ui.card('notice')}>
        <p><strong>{tr('Sign in first.')}</strong>{' '}{tr('Groups live in your cloud account, so they need you to be signed in{0}.', app.joinCode ? tr('. Your invitation is kept: sign in, then come back here to join') : '')}</p>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={openSettings}>{tr('Go to Settings')}</button>
      </div>
    );
  }
  if (open && settings) return <GroupSettings group={open} onBack={() => onOpen(open.id)} onLeft={() => onOpen()} />;
  if (open) return <GroupDetail group={open} onBack={() => onOpen()} onSettings={() => onOpen(open.id, true)} onAdd={() => onAdd(open.id)} />;
  if (groupId) {
    return (
      <div className={ui.card('notice')}>
        <p><strong>{tr('That group is not here.')}</strong>{' '}{tr('It may have been removed, or you may not be in it.')}</p>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => onOpen()}>{tr('All groups')}</button>
      </div>
    );
  }

  // what others did in a group since this phone last looked (the same figure the group page lists)
  const news = (g: Group): number => { const r = groupActivity(app.groupEntries, app.settlements, g.id, app.me, seen[g.id] ?? null, () => '', g); return r.items.length + r.more; };

  if (creating) {
    return (
      <section aria-label={tr('Create a group')} className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <button type="button" className={ui.backLink} onClick={() => setCreating(false)}><Icon name="back" size={20} stroke={2} />{tr('Groups')}</button>
          <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Create a group')}</h2>
        </div>
        <CreateCard onDone={() => setCreating(false)} />
      </section>
    );
  }

  const sorted = [...app.groups].sort((a, b) => Number(a.closed_at !== null) - Number(b.closed_at !== null));
  return (
    <section aria-label={tr('Groups')} className="flex flex-col gap-4">
      <div className="flex justify-between items-center gap-3">
        <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Groups')}</h2>
        <button type="button" className={ui.btn('solid', 'none', 'min-h-11 px-4 text-[15px]')} onClick={() => setCreating(true)}><Icon name="plus" size={18} stroke={2.2} />{tr('Create a group')}</button>
      </div>
      {app.groups.length === 0 && !app.joinCode && <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('No groups yet. Make one for the family or a trip, or join one with a code.')}</p>}
      {sorted.length > 0 && (
        <div className="grid gap-3 lg:grid-cols-3">
          {sorted.map((g) => <GroupCard key={g.id} id={g.id} news={news(g)} onOpen={() => onOpen(g.id)} />)}
        </div>
      )}
      {app.features.has('udhaar') && <PeopleLines onOpen={openUdhaar} />}
      <JoinCard />
      <CircleLink onOpen={openCircle} />
    </section>
  );
}

// One group as a card: its name and kind, who is in it (or a trip's days), what you are owed or owe, and what is new.
function GroupCard({ id, news, onOpen }: Readonly<{ id: string; news: number; onOpen: () => void }>) {
  const app = useApp();
  const g = app.groups.find((x) => x.id === id)!;
  const people = activeMembers(app.members, g.id);
  const bal = groupBalances(g.id, app.groupEntries, app.settlements)[app.me ?? ''] ?? 0;
  const names = [...people].sort((a, b) => Number(b.user_id === app.me) - Number(a.user_id === app.me)).map((m) => (m.user_id === app.me ? tr('You') : m.display_name));
  const who = g.kind === 'trip' && g.starts_on
    ? tr('{0} people · {1}', people.length, g.ends_on && g.starts_on.slice(0, 7) === g.ends_on.slice(0, 7) ? tr('{0} to {1}', String(Number(g.starts_on.slice(8))), shortDate(g.ends_on)) : [g.starts_on, g.ends_on].filter(Boolean).map((d) => shortDate(d!)).join(' – '))
    : names.length <= 4 ? listNames(names) : tr('{0} people', people.length);
  return (
    <button type="button" onClick={onOpen} className="text-left flex flex-col gap-2 bg-card border border-line rounded-card p-4 text-ink cursor-pointer [font-family:inherit] [line-height:inherit]">
      <span className="flex justify-between items-center gap-2"><span className="text-[17px] font-bold">{g.name}</span><span className="px-2 py-0.5 rounded-md bg-press text-[12px] font-semibold">{kindLabel(g.kind)}{g.closed_at ? tr(' (closed)') : ''}</span></span>
      <span className="text-[13px] text-muted">{who}</span>
      <span className="flex justify-between items-center gap-2 pt-1">
        <span className={ui.cx('text-[16px] font-bold tabular-nums', bal > 0 ? 'text-good' : bal < 0 ? 'text-bad' : 'text-muted')}>{bal === 0 ? tr('All settled') : bal > 0 ? tr('{0} owed to you', fmtINR(fromPaise(bal))) : tr('You owe {0}', fmtINR(fromPaise(-bal)))}</span>
        {news > 0 && <span className="px-2 py-0.5 rounded-full bg-warn-bg text-warn text-[12px] font-bold">{tr('{0} new', news)}</span>}
      </span>
    </button>
  );
}

// "You, Aakash and Meera"
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return tr('{0} and {1}', names.slice(0, -1).join(', '), names.at(-1)!);
}

// The way into the Circle: how many people, their initials, and an arrow.
function CircleLink({ onOpen }: Readonly<{ onOpen: () => void }>) {
  const app = useApp();
  const [people, setPeople] = useState<CircleMember[] | null>(null);
  useEffect(() => { let alive = true; app.circle().then((c) => { if (alive) setPeople(c); }).catch(() => { if (alive) setPeople(null); }); return () => { alive = false; }; }, [app]);
  const tints = ['bg-good-bg text-good', 'bg-warn-bg text-warn', 'bg-tint-blue text-tint-blue-ink', 'bg-press text-ink', 'bg-brand text-brand-ink'];
  return (
    <button type="button" onClick={onOpen} className="text-left grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center bg-card border border-line rounded-card p-4 text-ink cursor-pointer [font-family:inherit] [line-height:inherit]">
      <span className="flex flex-col gap-2">
        <span className="text-[16px] font-[650]">{tr('Your Circle')}</span>
        <span className="text-[14px] text-muted">{people ? tr('{0} people you share with', people.length) : tr('People you share with, and a code to add anyone')}</span>
        {people && people.length > 0 && (
          <span className="flex" aria-hidden="true">
            {people.slice(0, 6).map((m, i) => <span key={m.user_id} className={ui.cx('w-8 h-8 -mr-2 rounded-full border-2 border-card flex items-center justify-center text-[11px] font-bold', tints[i % tints.length])}>{circleName(m).slice(0, 2).toUpperCase()}</span>)}
          </span>
        )}
      </span>
      <span className="text-muted" aria-hidden="true"><Icon name="chevron" size={20} /></span>
    </button>
  );
}
