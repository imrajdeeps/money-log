import { useState } from 'react';
import { dayBefore } from './quickLog.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// The day of the payment: Today, Yesterday, or another day. `date` is null for today.
export function DateChips({ date, today, onChange, bare = false }: Readonly<{ date: string | null; today: string; onChange: (d: string | null) => void; bare?: boolean }>) {
  const yesterday = dayBefore(today);
  const [pick, setPick] = useState(false);
  const other = date !== null && date !== today && date !== yesterday;
  const showInput = pick || other;
  return (
    <div>
      <fieldset className={bare ? ui.chipsBare : ui.chips}>
        <legend>{tr('Date')}</legend>
        <button type="button" className={ui.chip} aria-pressed={!showInput && (date === null || date === today)} onClick={() => { setPick(false); onChange(null); }}>{tr('Today')}</button>
        <button type="button" className={ui.chip} aria-pressed={!showInput && date === yesterday} onClick={() => { setPick(false); onChange(yesterday); }}>{tr('Yesterday')}</button>
        <button type="button" className={ui.chip} aria-pressed={showInput} onClick={() => setPick(true)}>{tr('Another day')}</button>
      </fieldset>
      {showInput && (
        <label className={ui.field}>
          <span className="sr-only">{tr('Date')}</span>
          <input type="date" value={date ?? today} max={today} onChange={(e) => onChange(e.target.value || null)} />
        </label>
      )}
    </div>
  );
}
