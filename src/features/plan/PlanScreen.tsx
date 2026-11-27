import { Icon } from '../../ui/Icon.tsx';
import { GoalsScreen } from '../goals/index.ts';
import { DueForm } from './DueForm.tsx';
import { NetWorthCard } from './NetWorthCard.tsx';
import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { DEFAULT_ALERT, buildIcs, classifyDue, cleanAlert, dueRelative } from '../../core/blocks.ts';
import type { AlertPrefs, DueItem, DueView, SentEvent } from '../../core/blocks.ts';
import { afterExport, toCancel } from '../../core/calendar.ts';
import { loadSent, saveSent } from '../../data/calendar.ts';
import { saveFile } from '../../ui/files.ts';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import { shortDate, stamp } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

const ALERT_KEY = 'money-log.alert';

function loadAlert(): AlertPrefs {
  try { return cleanAlert(JSON.parse(localStorage.getItem(ALERT_KEY) ?? 'null')); } catch { return DEFAULT_ALERT; }
}

const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

function DueRow({ v, first, onToggle, onEdit, onDelete }: Readonly<{ v: DueView; first: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }>) {
  const late = v.state === 'overdue';
  const when = v.due ? (late ? tr('Overdue · was due {0}', shortDate(v.due)) : tr('Due {0}', shortDate(v.due))) : (v.kind === 'todo' ? tr('To-do · no date') : tr('No date'));
  return (
    <SwipeRow className={ui.cx('grid grid-cols-[44px_minmax(0,1fr)_auto] gap-1.5 items-center min-h-[62px]', first ? '' : 'border-t border-line')} label={v.title} onDelete={onDelete}>
      <button type="button" className="w-11 h-11 border-0 bg-transparent flex items-center justify-center cursor-pointer" aria-pressed={v.isDone} aria-label={`${v.isDone ? tr('Mark not done') : tr('Mark done')}: ${v.title}`} onClick={onToggle}>
        <span className={ui.cx('w-[22px] h-[22px] rounded-full border-[1.5px] flex items-center justify-center', v.isDone ? 'bg-good border-good text-good-ink' : 'border-field-line')}>{v.isDone ? <Icon name="check" size={16} stroke={2.6} /> : null}</span>
      </button>
      <button type="button" className="flex flex-col min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left text-ink [font:inherit]" onClick={onEdit} aria-label={tr('Change: {0}', v.title)}>
        <span className={ui.cx('text-[15px] font-semibold truncate', v.isDone && 'line-through text-muted')}>{v.title}</span>
        <span className={ui.cx('text-[13px]', late ? 'text-bad font-semibold' : 'text-muted')}>{when}</span>
      </button>
      {v.amount ? <span className="text-[15px] font-bold tabular-nums">{fmtINR(v.amount)}</span> : <span />}
    </SwipeRow>
  );
}

function DueSection() {
  const app = useApp();
  const [alert, setAlert] = useState<AlertPrefs>(loadAlert);
  const [sent, setSent] = useState(loadSent);
  const today = isoDate();
  const [form, setForm] = useState<'new' | DueItem | null>(null);
  const views = useMemo(() => classifyDue(app.dueItems, {}, '', today), [app.dueItems, today]);

  function pick(next: AlertPrefs) {
    setAlert(next);
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(next)); } catch { /* a remembered choice is a convenience only */ }
  }

  // `cancels` are the events an earlier file put in the calendar whose item is now finished, removed or renamed: only the full file carries them.
  async function calendar(list: DueView[], name: string, cancels: readonly SentEvent[] = []) {
    const r = await saveFile(`money-log-${name}-${stamp()}.ics`, buildIcs(list, alert, new Date().toISOString(), cancels), 'text/calendar');
    if (r === 'cancelled') return;
    const next = afterExport(sent, list, cancels);
    setSent(next);
    saveSent(next);
    const base = r === 'shared' ? tr('Calendar file shared. Open it to add the events.') : tr('Calendar file downloaded. Open it to add the events.');
    app.toast(cancels.length > 0 ? `${base} ${tr('{0} finished or removed event{1} cancelled in it.', cancels.length, cancels.length === 1 ? ' is' : 's are')}` : base);
  }

  function remove(v: DueView) {
    void app.removeDue(v.k).then(() => app.toast(tr('Removed: {0}', v.title)));
  }

  const overdue = views.filter((v) => v.state === 'overdue');
  const upcoming = views.filter((v) => v.state === 'today' || v.state === 'soon' || v.state === 'later');
  const undated = views.filter((v) => v.state === 'nodate');
  const finished = views.filter((v) => v.state === 'done');
  const calendarable = views.filter((v) => v.due && !v.isDone && v.due >= today);
  const cancels = toCancel(sent, app.dueItems, {}, '');

  const open = [...overdue, ...upcoming, ...undated];

  return (
    <section aria-label={tr('Due soon')} id="due" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-[16px] leading-[22px] font-[650] text-ink">{tr('Due soon')}</h3>
        {!form && <button type="button" className="min-h-11 border-0 bg-transparent p-0 text-brand text-[14px] font-[650] underline underline-offset-2 cursor-pointer [font-family:inherit]" onClick={() => setForm('new')}>{tr('Add')}</button>}
      </div>
      {form && <DueForm key={form === 'new' ? 'new' : form.k} item={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}
      {views.length === 0 && !form && <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Nothing is due. Add a payment or a to-do, with a date if it has one.')}</p>}
      {open.length > 0 && (
        <ul className="list-none m-0 pl-1.5 pr-3 bg-card border border-line rounded-card">
          {open.map((v, i) => <DueRow key={v.k} v={v} first={i === 0} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onEdit={() => setForm(v)} onDelete={() => remove(v)} />)}
        </ul>
      )}
      {finished.length > 0 && (
        <details className={ui.finished('my-0')}>
          <summary>{tr('Done ({0})', finished.length)}</summary>
          <ul className="list-none m-0 pl-1.5 pr-3 bg-card border border-line rounded-card">
            {finished.map((v, i) => <DueRow key={v.k} v={v} first={i === 0} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onEdit={() => setForm(v)} onDelete={() => remove(v)} />)}
          </ul>
        </details>
      )}
      <div className="flex flex-col gap-2.5 bg-card border border-line rounded-card p-4">
        <span className="text-[15px] font-[650]">{tr('Calendar')}</span>
        <p className="m-0 text-[14px] leading-5 text-muted">{tr('Makes a calendar file for your phone\'s calendar, with an alert before each item. Nothing is sent anywhere.')}{cancels.length > 0 ? ' ' + tr('It also cancels {0} event{1} for items since finished or removed.', cancels.length, cancels.length === 1 ? '' : 's') : ''}</p>
        <div className="grid grid-cols-2 gap-2.5">
          <label className={ui.fieldBare}>
            <span>{tr('Alert')}</span>
            <select value={alert.daysBefore} onChange={(e) => pick({ ...alert, daysBefore: Number(e.target.value) })} aria-label={tr('Days before the due date')}>
              <option value={0}>{tr('On the day')}</option>
              {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{tr('{0} day{1} before', d, d === 1 ? '' : 's')}</option>)}
            </select>
          </label>
          <label className={ui.fieldBare}>
            <span>{tr('At')}</span>
            <select value={alert.hour} onChange={(e) => pick({ ...alert, hour: Number(e.target.value) })} aria-label={tr('Time of the alert')}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className={ui.btn('outline')} disabled={calendarable.length === 0 && cancels.length === 0} onClick={() => { void calendar(calendarable, 'due', cancels); }}>
          {tr('Add {0} to calendar', calendarable.length)}
        </button>
      </div>
    </section>
  );
}

// With Net worth off (Settings, Features, version 2.1): one quiet row that says where it is turned on.
function WorthHint({ onOpen }: Readonly<{ onOpen: () => void }>) {
  return (
    <button type="button" onClick={onOpen} className="w-full grid grid-cols-[minmax(0,1fr)_18px] gap-2.5 items-center min-h-[52px] px-3.5 py-3 rounded-[14px] border-0 bg-press text-ink text-left cursor-pointer [font-family:inherit]">
      <span className="flex flex-col gap-0.5"><span className="text-[14px] font-[650]">{tr('Want your net worth here too?')}</span><span className="text-[13px] leading-[18px] text-muted">{tr('Turn it on in Settings, Features.')}</span></span>
      <Icon name="chevron" size={18} />
    </button>
  );
}

export function PlanScreen({ onUdhaar, onFeatures }: Readonly<{ onUdhaar: () => void; onFeatures: () => void }>) {
  const app = useApp();
  const worth = app.features.has('worth');
  const udhaar = app.features.has('udhaar') && <button type="button" className={ui.btn('outline')} onClick={onUdhaar}>{tr('Udhaar: money lent and borrowed')}</button>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col">
        <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr('Plan')}</h2>
        <p className="m-0 text-[14px] text-muted">{worth ? tr('What you own and owe, what you are saving for, and what is due.') : tr('What you are saving for, and what is due.')}</p>
      </div>
      {worth ? (
        <div className="grid gap-x-7 gap-y-4 items-start lg:grid-cols-2">
          <section aria-label={tr('Net worth')}><NetWorthCard /></section>
          <div className="flex flex-col gap-4"><GoalsScreen /><DueSection />{udhaar}</div>
        </div>
      ) : (
        <div className="grid gap-x-7 gap-y-4 items-start lg:grid-cols-2">
          <GoalsScreen />
          <div className="flex flex-col gap-4"><DueSection />{udhaar}<WorthHint onOpen={onFeatures} /></div>
        </div>
      )}
    </div>
  );
}
