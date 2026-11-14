import { useEffect } from 'react';
import { useApp } from '../../data/context.tsx';
import { activeMembers, fromPaise, groupBalances } from '../../core/groups.ts';
import { kindLabel } from '../../core/groupKinds.ts';
import { fmtINR } from '../../core/logic.ts';
import { GroupDetail } from './GroupDetail.tsx';
import { GroupSettings } from './GroupSettings.tsx';
import { CreateCard } from './CreateCard.tsx';
import { JoinCard } from './JoinCard.tsx';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// groupId: the group named in the address (/groups/<id>), or none for the list. settings: that group's settings are open
// (/groups/<id>/settings). onOpen(id) goes to a group, onOpen(id, true) to its settings, onOpen() to the list.
export function GroupsScreen({ groupId, settings = false, onOpen, openSettings, openCircle }: Readonly<{ groupId?: string; settings?: boolean; onOpen: (id?: string, settings?: boolean) => void; openSettings: () => void; openCircle: () => void }>) {
  const app = useApp();
  const open = groupId ? app.groups.find((g) => g.id === groupId.toLowerCase()) : undefined;
  // An invitation arrived (a tapped link): go back to the list, where the join form is.
  useEffect(() => { if (app.joinCode && groupId) onOpen(); }, [app.joinCode, groupId, onOpen]);

  if (!app.syncEnabled) {
    return <div className={ui.card('notice')}><p><strong>{tr('Groups need cloud sync.')}</strong>{' '}{tr('It is not set up in this build, so payments stay on this phone only. The README explains how to turn it on.')}</p></div>;
  }
  if (app.sync.mode === 'signedout' || !app.me) {
    return (
      <div className={ui.card('notice')}>
        <p><strong>{tr('Sign in first.')}</strong>{' '}{tr('Groups live in your cloud account, so they need you to be signed in{0}.', app.joinCode ? tr('. Your invitation is kept: sign in, then come back here to join') : '')}</p>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={openSettings}>{tr('Go to Settings')}</button>
      </div>
    );
  }
  if (open && settings) return <GroupSettings group={open} onBack={() => onOpen(open.id)} onLeft={() => onOpen()} />;
  if (open) return <GroupDetail group={open} onBack={() => onOpen()} onSettings={() => onOpen(open.id, true)} />;
  if (groupId) {
    return (
      <div className={ui.card('notice')}>
        <p><strong>{tr('That group is not here.')}</strong>{' '}{tr('It may have been removed, or you may not be in it.')}</p>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={() => onOpen()}>{tr('All groups')}</button>
      </div>
    );
  }

  return (
    <section aria-label={tr('Groups')} className="[&>*+*]:mt-4 [&>p]:mb-0">
      <JoinCard />
      <button type="button" className={ui.row} onClick={openCircle}>
        <span className={ui.rowMain()}><b>{tr('Your Circle')}</b><small>{tr('People you share with, and a code to add anyone')}</small></span>
      </button>
      {app.groups.length === 0 && !app.joinCode && <p className="text-muted">{tr('No groups yet. Make one for the family or a trip, or join one with a code.')}</p>}
      {app.groups.length > 0 && (
        <ul className={ui.list()}>
          {[...app.groups].sort((a, b) => Number(a.closed_at !== null) - Number(b.closed_at !== null)).map((g) => {
            const bal = groupBalances(g.id, app.groupEntries, app.settlements)[app.me ?? ''] ?? 0;
            return (
              <li key={g.id}>
                <button type="button" className={ui.row} onClick={() => onOpen(g.id)}>
                  <span className={ui.rowMain()}>
                    <b>{g.name}</b>
                    <small>{tr('{0}{1} · {2} people', kindLabel(g.kind), g.closed_at ? tr(' (closed)') : '', activeMembers(app.members, g.id).length)}</small>
                  </span>
                  <span className={`tabular-nums ${bal > 0 ? ui.owed : bal < 0 ? ui.late : 'font-bold text-muted'}`}>{bal === 0 ? tr('Settled') : bal > 0 ? `+${fmtINR(fromPaise(bal))}` : `−${fmtINR(fromPaise(-bal))}`}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <CreateCard />
    </section>
  );
}
