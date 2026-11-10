import { Icon } from '../../ui/Icon.tsx';
import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { DEFAULT_ALERT, buildIcs, classifyDue, cleanAlert, dueRelative, fmtNet } from '../../core/blocks.ts';
import type { AlertPrefs, DueView, NetItem } from '../../core/blocks.ts';
import { saveFile } from '../../ui/files.ts';
import { SwipeRow } from '../../ui/SwipeRow.tsx';
import { monthLabel, shortDate, stamp } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';
import * as ui from '../../ui/styles.ts';

const ALERT_KEY = 'money-log.alert';

function loadAlert(): AlertPrefs {
  try { return cleanAlert(JSON.parse(localStorage.getItem(ALERT_KEY) ?? 'null')); } catch { return DEFAULT_ALERT; }
}

const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

function DueRow({ v, onToggle, onCalendar, onDelete }: { v: DueView; onToggle: () => void; onCalendar: (() => void) | null; onDelete: () => void }) {
  const what = v.kind === 'oneoff' ? 'One-off payment' : 'To-do';
  const when = v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : 'No date';
  return (
    <SwipeRow className={ui.dueRow(v.isDone)} label={v.title} onDelete={onDelete}>
      <button type="button" className="min-w-11 min-h-11 flex-none rounded-[50%] border-2 border-line bg-transparent text-good-ink text-[20px] font-bold cursor-pointer aria-pressed:bg-good aria-pressed:border-good" aria-pressed={v.isDone} aria-label={`${v.isDone ? 'Mark not done' : 'Mark done'}: ${v.title}`} onClick={onToggle}>
        {v.isDone ? <Icon name="check" size={22} /> : null}
      </button>
      <span className={ui.rowMain(true)}>
        <b>{v.title}</b>
        <small className={v.state === 'overdue' ? ui.late : undefined}>{when} · {what}</small>
      </span>
      {v.amount ? <span className="font-bold tabular-nums">{fmtINR(v.amount)}</span> : null}
      {onCalendar && <button type="button" className={ui.icoBtn} aria-label={`Add to calendar: ${v.title}`} onClick={onCalendar}><Icon name="calendar" size={22} /></button>}
    </SwipeRow>
  );
}

function DueSection() {
  const app = useApp();
  const [alert, setAlert] = useState<AlertPrefs>(loadAlert);
  const today = isoDate();
  const due = app.due;
  const views = useMemo(() => (due ? classifyDue(due.items, app.doneMap, due.importedAt, today) : []), [due, app.doneMap, today]);

  function pick(next: AlertPrefs) {
    setAlert(next);
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(next)); } catch { /* a remembered choice is a convenience only */ }
  }

  async function calendar(list: DueView[], name: string) {
    const r = await saveFile(`money-log-${name}-${stamp()}.ics`, buildIcs(list, alert, new Date().toISOString()), 'text/calendar');
    if (r === 'cancelled') return;
    app.toast(r === 'shared' ? 'Calendar file shared. Open it to add the events.' : 'Calendar file downloaded. Open it to add the events.');
  }

  function remove(v: DueView) {
    void app.removeDue(v.k).then(() => app.toast(`Removed: ${v.title}`));
  }

  if (!due) return null;
  const overdue = views.filter((v) => v.state === 'overdue');
  const upcoming = views.filter((v) => v.state === 'today' || v.state === 'soon' || v.state === 'later');
  const undated = views.filter((v) => v.state === 'nodate');
  const finished = views.filter((v) => v.state === 'done');
  const calendarable = views.filter((v) => v.due && !v.isDone && v.due >= today);

  const block = (title: string, list: DueView[], badge?: string) => list.length > 0 && (
    <>
      <h3 className="text-[16px] mt-5 mb-2">{title}{badge ? <span className={ui.tag}>{badge}</span> : null}</h3>
      <ul className={ui.list()}>
        {list.map((v) => (
          <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }}
            onCalendar={v.due && !v.isDone ? () => { void calendar([v], 'event'); } : null} onDelete={() => remove(v)} />
        ))}
      </ul>
    </>
  );

  return (
    <section aria-label="Due soon">
      <h2>Due soon</h2>
      {views.length === 0 && <p className="text-muted">The imported list has nothing on it.</p>}
      {block('Overdue', overdue, `${overdue.length}`)}
      {block('Coming up', upcoming)}
      {block('No date', undated)}
      {finished.length > 0 && (
        <details className={ui.finished()}>
          <summary>Done ({finished.length})</summary>
          <ul className={ui.list()}>
            {finished.map((v) => <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onCalendar={null} onDelete={() => remove(v)} />)}
          </ul>
        </details>
      )}
      <div className={ui.card()}>
        <h3>Calendar</h3>
        <p className="text-muted text-[13px]">
          Makes a calendar file with every dated item that is not done yet ({calendarable.length} now), each with an alert
          {' '}{alert.daysBefore === 0 ? 'on the day' : `${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'} before`} at {hourLabel(alert.hour)}.
          Open the file and your calendar app adds the events. Opening it again later updates them rather than adding copies.
        </p>
        <div className={ui.btnRow}>
          <label className={ui.fieldHalf}>
            <span>Alert</span>
            <select value={alert.daysBefore} onChange={(e) => pick({ ...alert, daysBefore: Number(e.target.value) })} aria-label="Days before the due date">
              <option value={0}>On the day</option>
              {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'} before</option>)}
            </select>
          </label>
          <label className={ui.fieldHalf}>
            <span>At</span>
            <select value={alert.hour} onChange={(e) => pick({ ...alert, hour: Number(e.target.value) })} aria-label="Time of the alert">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} disabled={calendarable.length === 0} onClick={() => { void calendar(calendarable, 'due'); }}>
          Add {calendarable.length} to calendar
        </button>
      </div>
    </section>
  );
}

function Figure({ i }: { i: NetItem }) {
  const pct = i.unit === '%' ? Math.max(0, Math.min(100, i.value)) : null;
  return (
    <li className="px-3.5 py-3">
      <div className={ui.catLine}><span>{i.label}</span><b>{fmtNet(i)}</b></div>
      {pct !== null && <div className={ui.bar} aria-hidden="true"><i className={ui.barFill('good')} style={{ width: `${pct}%` }} /></div>}
    </li>
  );
}

function SnapshotSection() {
  const app = useApp();
  const n = app.net;
  if (!n) return null;
  const imported = new Date(n.importedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <section aria-label="Net worth and goals" id="networth">
      <h2 className="text-[16px] mt-5 mb-2">Net worth and goals</h2>
      <p className="text-muted text-[13px]">
        {n.asOf ? `Plan month ${monthLabel(n.asOf.slice(0, 7))}. ` : ''}Imported {imported}. These are the spreadsheet's figures at that time; they do not change as you log payments.
      </p>
      <ul className={ui.list()}>{n.items.map((i) => <Figure key={i.label} i={i} />)}</ul>
    </section>
  );
}

export function PlanScreen({ openSettings, openGoals }: { openSettings: () => void; openGoals: () => void }) {
  const app = useApp();
  return (
    <div>
      <div className={ui.card()}>
        <h3>Goals</h3>
        <p className="text-muted text-[13px]">Make short-term and long-term goals, see how far along each one is, and what to set aside each month.</p>
        <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={openGoals}>Open goals</button>
      </div>
      {!app.due && !app.net && (
        <div className={ui.card('notice')}>
          <p><strong>Nothing imported yet.</strong> The due list and the net worth and goals figures come from the spreadsheet's App export tab.</p>
          <button type="button" className={ui.btn('solid', 'md', ui.inCard)} onClick={openSettings}>Go to Settings</button>
        </div>
      )}
      <DueSection />
      <SnapshotSection />
    </div>
  );
}
