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

function DueRow({ v, onToggle, onEdit, onCalendar, onDelete }: { v: DueView; onToggle: () => void; onEdit: () => void; onCalendar: (() => void) | null; onDelete: () => void }) {
  const what = v.kind === 'oneoff' ? tr('One-off payment') : tr('To-do');
  const when = v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : tr('No date');
  return (
    <SwipeRow className={ui.dueRow(v.isDone)} label={v.title} onDelete={onDelete}>
      <button type="button" className="min-w-11 min-h-11 flex-none rounded-[50%] border-2 border-line bg-transparent text-good-ink text-[20px] font-bold cursor-pointer aria-pressed:bg-good aria-pressed:border-good" aria-pressed={v.isDone} aria-label={`${v.isDone ? tr('Mark not done') : tr('Mark done')}: ${v.title}`} onClick={onToggle}>
        {v.isDone ? <Icon name="check" size={22} /> : null}
      </button>
      <button type="button" className={ui.rowMain(true) + ' cursor-pointer border-0 bg-transparent p-0 text-left text-inherit [font:inherit]'} onClick={onEdit} aria-label={tr('Change: {0}', v.title)}>
        <b>{v.title}</b>
        <small className={v.state === 'overdue' ? ui.late : undefined}>{when} · {what}</small>
      </button>
      {v.amount ? <span className="font-bold tabular-nums">{fmtINR(v.amount)}</span> : null}
      {onCalendar && <button type="button" className={ui.icoBtn} aria-label={tr('Add to calendar: {0}', v.title)} onClick={onCalendar}><Icon name="calendar" size={22} /></button>}
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

  const block = (title: string, list: DueView[], badge?: string) => list.length > 0 && (
    <>
      <h3 className="text-[16px] mt-5 mb-2">{title}{badge ? <span className={ui.tag}>{badge}</span> : null}</h3>
      <ul className={ui.list()}>
        {list.map((v) => (
          <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onEdit={() => setForm(v)}
            onCalendar={v.due && !v.isDone ? () => { void calendar([v], 'event'); } : null} onDelete={() => remove(v)} />
        ))}
      </ul>
    </>
  );

  return (
    <section aria-label={tr('Due soon')} id="due">
      <div className="mt-5 mb-2 flex items-center justify-between gap-3">
        <h2 className="m-0">{tr('Due soon')}</h2>
        {!form && <button type="button" className={ui.btn('solid', 'small')} onClick={() => setForm('new')}>{tr('Add an item')}</button>}
      </div>
      {form && <DueForm key={form === 'new' ? 'new' : form.k} item={form === 'new' ? undefined : form} onDone={() => setForm(null)} />}
      {views.length === 0 && !form && <p className="text-muted">{tr('Nothing is due. Add a payment or a to-do, with a date if it has one.')}</p>}
      {block(tr('Overdue'), overdue, `${overdue.length}`)}
      {block(tr('Coming up'), upcoming)}
      {block(tr('No date'), undated)}
      {finished.length > 0 && (
        <details className={ui.finished()}>
          <summary>{tr('Done ({0})', finished.length)}</summary>
          <ul className={ui.list()}>
            {finished.map((v) => <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onEdit={() => setForm(v)} onCalendar={null} onDelete={() => remove(v)} />)}
          </ul>
        </details>
      )}
      <div className={ui.card()}>
        <h3>{tr('Calendar')}</h3>
        <p className="text-muted text-[13px]">
          {tr('Makes a calendar file with every dated item that is not done yet ({0} now), each with an alert {1} at {2}. Open the file and your calendar app adds the events. Opening it again later updates them rather than adding copies.', calendarable.length, alert.daysBefore === 0 ? tr('on the day') : tr('{0} day{1} before', alert.daysBefore, alert.daysBefore === 1 ? '' : 's'), hourLabel(alert.hour))}
        </p>
        <p className="text-muted text-[13px]">{tr('Events for items you have since finished or removed are cancelled in the next file, so your calendar drops them ({0} now). This covers only events this phone put in a file.', cancels.length)}</p>
        <div className={ui.btnRow}>
          <label className={ui.fieldHalf}>
            <span>{tr('Alert')}</span>
            <select value={alert.daysBefore} onChange={(e) => pick({ ...alert, daysBefore: Number(e.target.value) })} aria-label={tr('Days before the due date')}>
              <option value={0}>{tr('On the day')}</option>
              {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{tr('{0} day{1} before', d, d === 1 ? '' : 's')}</option>)}
            </select>
          </label>
          <label className={ui.fieldHalf}>
            <span>{tr('At')}</span>
            <select value={alert.hour} onChange={(e) => pick({ ...alert, hour: Number(e.target.value) })} aria-label={tr('Time of the alert')}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={calendarable.length === 0 && cancels.length === 0} onClick={() => { void calendar(calendarable, 'due', cancels); }}>
          {tr('Add {0} to calendar', calendarable.length)}
        </button>
      </div>
    </section>
  );
}

export function PlanScreen() {
  return (
    <div>
      <section aria-label={tr('Net worth and goals')}>
        <NetWorthCard />
        <GoalsScreen />
      </section>
      <DueSection />
    </div>
  );
}
