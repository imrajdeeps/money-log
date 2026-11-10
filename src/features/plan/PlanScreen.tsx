import { useMemo, useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { DEFAULT_ALERT, buildIcs, classifyDue, cleanAlert, dueRelative, fmtNet } from '../../core/blocks.ts';
import type { AlertPrefs, DueView, NetItem } from '../../core/blocks.ts';
import { saveFile } from '../../ui/files.ts';
import { monthLabel, shortDate, stamp } from '../../core/format.ts';
import { fmtINR, isoDate } from '../../core/logic.ts';

const ALERT_KEY = 'money-log.alert';

function loadAlert(): AlertPrefs {
  try { return cleanAlert(JSON.parse(localStorage.getItem(ALERT_KEY) ?? 'null')); } catch { return DEFAULT_ALERT; }
}

const hourLabel = (h: number) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'am' : 'pm'}`;

function DueRow({ v, onToggle, onCalendar }: { v: DueView; onToggle: () => void; onCalendar: (() => void) | null }) {
  const what = v.kind === 'oneoff' ? 'One-off payment' : 'To-do';
  const when = v.due ? `${shortDate(v.due)} · ${dueRelative(v.days)}` : 'No date';
  return (
    <li className={`duerow${v.isDone ? ' done' : ''}`}>
      <button type="button" className="tick" aria-pressed={v.isDone} aria-label={`${v.isDone ? 'Mark not done' : 'Mark done'}: ${v.title}`} onClick={onToggle}>
        {v.isDone ? '✓' : ''}
      </button>
      <span className="row-main">
        <b>{v.title}</b>
        <small className={v.state === 'overdue' ? 'late' : undefined}>{when} · {what}</small>
      </span>
      {v.amount ? <span className="amt">{fmtINR(v.amount)}</span> : null}
      {onCalendar && <button type="button" className="icobtn" aria-label={`Add to calendar: ${v.title}`} onClick={onCalendar}>📅</button>}
    </li>
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

  if (!due) return null;
  const overdue = views.filter((v) => v.state === 'overdue');
  const upcoming = views.filter((v) => v.state === 'today' || v.state === 'soon' || v.state === 'later');
  const undated = views.filter((v) => v.state === 'nodate');
  const finished = views.filter((v) => v.state === 'done');
  const calendarable = views.filter((v) => v.due && !v.isDone && v.due >= today);

  const block = (title: string, list: DueView[], badge?: string) => list.length > 0 && (
    <>
      <h3 className="h2">{title}{badge ? <span className="tag bad">{badge}</span> : null}</h3>
      <ul className="list">
        {list.map((v) => (
          <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }}
            onCalendar={v.due && !v.isDone ? () => { void calendar([v], 'event'); } : null} />
        ))}
      </ul>
    </>
  );

  return (
    <section aria-label="Due soon">
      <h2>Due soon</h2>
      {views.length === 0 && <p className="muted">The imported list has nothing on it.</p>}
      {block('Overdue', overdue, `${overdue.length}`)}
      {block('Coming up', upcoming)}
      {block('No date', undated)}
      {finished.length > 0 && (
        <details className="finished">
          <summary>Done ({finished.length})</summary>
          <ul className="list">
            {finished.map((v) => <DueRow key={v.k} v={v} onToggle={() => { void app.toggleDone(v.k, !v.isDone); }} onCalendar={null} />)}
          </ul>
        </details>
      )}
      <div className="card">
        <h3>Calendar</h3>
        <p className="muted small">
          Makes a calendar file with every dated item that is not done yet ({calendarable.length} now), each with an alert
          {' '}{alert.daysBefore === 0 ? 'on the day' : `${alert.daysBefore} day${alert.daysBefore === 1 ? '' : 's'} before`} at {hourLabel(alert.hour)}.
          Open the file and your calendar app adds the events. Opening it again later updates them rather than adding copies.
        </p>
        <div className="btnrow">
          <label className="field half">
            <span>Alert</span>
            <select value={alert.daysBefore} onChange={(e) => pick({ ...alert, daysBefore: Number(e.target.value) })} aria-label="Days before the due date">
              <option value={0}>On the day</option>
              {[1, 2, 3, 5, 7, 14].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'} before</option>)}
            </select>
          </label>
          <label className="field half">
            <span>At</span>
            <select value={alert.hour} onChange={(e) => pick({ ...alert, hour: Number(e.target.value) })} aria-label="Time of the alert">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="btn" disabled={calendarable.length === 0} onClick={() => { void calendar(calendarable, 'due'); }}>
          Add {calendarable.length} to calendar
        </button>
      </div>
    </section>
  );
}

function Figure({ i }: { i: NetItem }) {
  const pct = i.unit === '%' ? Math.max(0, Math.min(100, i.value)) : null;
  return (
    <li className="catrow">
      <div className="catline"><span>{i.label}</span><b>{fmtNet(i)}</b></div>
      {pct !== null && <div className="bar" aria-hidden="true"><i className="good" style={{ width: `${pct}%` }} /></div>}
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
      <h2 className="h2">Net worth and goals</h2>
      <p className="muted small">
        {n.asOf ? `Plan month ${monthLabel(n.asOf.slice(0, 7))}. ` : ''}Imported {imported}. These are the spreadsheet's figures at that time; they do not change as you log payments.
      </p>
      <ul className="list">{n.items.map((i) => <Figure key={i.label} i={i} />)}</ul>
    </section>
  );
}

export function PlanScreen({ openSettings }: { openSettings: () => void }) {
  const app = useApp();
  return (
    <div>
      {!app.due && !app.net && (
        <div className="card notice">
          <p><strong>Nothing imported yet.</strong> The due list and the net worth and goals figures come from the spreadsheet's App export tab.</p>
          <button type="button" className="btn" onClick={openSettings}>Go to Settings</button>
        </div>
      )}
      <DueSection />
      <SnapshotSection />
    </div>
  );
}
