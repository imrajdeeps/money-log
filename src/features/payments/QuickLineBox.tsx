import { useState } from 'react';
import { useApp } from '../../data/context.tsx';
import { isoDate } from '../../core/logic.ts';
import { parseQuickLine } from './quickLine.ts';
import type { QuickLine } from './quickLine.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// "450 swiggy upi" and Enter: the form below is filled in for a last look. Nothing is saved from here.
export function QuickLineBox({ onFill }: Readonly<{ onFill: (line: QuickLine) => void }>) {
  const app = useApp();
  const [text, setText] = useState('');
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  function go() {
    if (text.trim() === '') return;
    const r = parseQuickLine(text, isoDate(), app.entries, app.categories);
    if (!r.ok) { setNote({ text: r.problem, bad: true }); return; }
    onFill(r.line);
    setText('');
    setNote({ text: r.line.category ? tr('Filled in. Check it, then save.') : tr('Filled in. Pick a category, then save.'), bad: false });
  }
  return (
    <div className="mb-1">
      <label className={ui.field}>
        <span>{tr('In one line')}</span>
        <input
          value={text}
          enterKeyHint="go"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={tr('450 swiggy upi')}
          onChange={(e) => { setText(e.target.value); setNote(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }}
        />
      </label>
      {note && <p className={ui.msg(note.bad ? 'bad' : undefined)} role="status">{note.text}</p>}
    </div>
  );
}
