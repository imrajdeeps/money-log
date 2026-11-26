import { useState } from 'react';
import { clearCrashes, crashReportText, useCrashScreenShown, useCrashes } from '../data/crashes.ts';
import { copyText } from './files.ts';
import { tr } from '../core/i18n.ts';
import * as ui from './styles.ts';

// "Copy report": the text of what went wrong, ready to send. If the browser will not copy it, the text is shown to select by hand.
export function CopyReport({ look = 'full' }: Readonly<{ look?: 'full' | 'bad' }>) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [text, setText] = useState('');
  async function copy() {
    const t = crashReportText();
    setText(t);
    setState((await copyText(t)) ? 'copied' : 'failed');
  }
  return (
    <>
      <button type="button" className={look === 'bad' ? ui.btn('dangerOutline', 'none', 'min-h-10 px-3 text-[14px]') : ui.btn('outline', 'none', 'min-h-12 text-[16px]')} onClick={() => { void copy(); }}>{state === 'copied' ? tr('Copied') : tr('Copy report')}</button>
      {state === 'failed' && (
        <label className="mt-2 block w-full basis-full text-[13px]">
          {tr('The browser would not copy it. Select the text below and copy it yourself.')}
          <textarea readOnly rows={6} value={text} onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded-lg border border-line bg-card p-2 text-[12px] text-ink" />
        </label>
      )}
    </>
  );
}

/** Shown over the app when something broke that nothing handled: it says so, and offers the report. Nothing is sent anywhere. */
export function CrashBar() {
  const crashes = useCrashes();
  const screenShown = useCrashScreenShown();
  if (crashes.length === 0 || screenShown) return null; // a crash screen already says so, in full
  return (
    <div role="alert" className="fixed inset-x-4 top-[calc(8px+env(safe-area-inset-top))] z-[80] mx-auto max-w-[528px] flex flex-col gap-2 rounded-card bg-bad-bg px-3.5 py-3 [box-shadow:var(--shadow-pop)]">
      <span className="text-[15px] font-bold text-bad">{tr('Part of this page did not load')}</span>
      <span className="text-[14px] leading-5 text-ink">{tr('Your payments are safe. Reload the page, or copy a report if it keeps happening.')}</span>
      <div className="flex flex-wrap items-center gap-2">
        <CopyReport look="bad" />
        <button type="button" className="min-h-10 px-3 rounded-[10px] border-0 bg-transparent text-ink text-[14px] font-semibold cursor-pointer [font-family:inherit]" onClick={clearCrashes}>{tr('Dismiss')}</button>
      </div>
    </div>
  );
}
