import { useState } from 'react';
import { clearCrashes, crashReportText, useCrashScreenShown, useCrashes } from '../data/crashes.ts';
import { copyText } from './files.ts';
import { tr } from '../core/i18n.ts';
import * as ui from './styles.ts';

// "Copy report": the text of what went wrong, ready to send. If the browser will not copy it, the text is shown to select by hand.
export function CopyReport({ colour = 'ghost' }: Readonly<{ colour?: 'ghost' | 'solid' }>) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [text, setText] = useState('');
  async function copy() {
    const t = crashReportText();
    setText(t);
    setState((await copyText(t)) ? 'copied' : 'failed');
  }
  return (
    <>
      <button type="button" className={ui.btn(colour, 'small')} onClick={() => { void copy(); }}>{state === 'copied' ? tr('Copied') : tr('Copy report')}</button>
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
    <div role="alert" className="fixed inset-x-3 top-[calc(8px+env(safe-area-inset-top))] z-[80] mx-auto flex max-w-[528px] flex-col gap-2 rounded-xl border border-bad bg-bad-bg px-3 py-2.5 text-[14px] text-bad shadow-lg">
      <span className="font-semibold">{tr('Something went wrong. Your payments on this phone are safe.')}</span>
      <div className="flex flex-wrap items-center gap-2">
        <CopyReport />
        <button type="button" className={ui.btn('ghost', 'small')} onClick={clearCrashes}>{tr('Dismiss')}</button>
      </div>
    </div>
  );
}
