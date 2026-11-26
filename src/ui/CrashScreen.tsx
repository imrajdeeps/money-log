import { useEffect } from 'react';
import { crashScreenShown } from '../data/crashes.ts';
import { CopyReport } from './CrashBar.tsx';
import { tr } from '../core/i18n.ts';
import * as ui from './styles.ts';

// What takes the place of a blank page when drawing a screen fails. The person's payments are not touched by a drawing error, so it can
// say they are kept; reloading starts the app again from them. Used by the router (a page that failed) and by the root safety net.
export function CrashScreen() {
  useEffect(() => crashScreenShown(), []);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-4 px-6 py-8 text-ink">
      <span className="w-14 h-14 rounded-2xl bg-warn-bg text-warn flex items-center justify-center" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></svg>
      </span>
      <h1 className="m-0 text-[26px] leading-8 font-[750]">{tr('Something went wrong')}</h1>
      <p className="m-0 text-[16px] leading-6">{tr('Your payments are kept on this phone and are not lost. Reloading usually fixes it.')}</p>
      <button type="button" className={ui.btn('solid', 'none', 'min-h-14 text-[17px] font-bold')} onClick={() => { window.location.reload(); }}>{tr('Reload')}</button>
      <CopyReport />
      <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('The report has no amounts, names or notes. Paste it in a message to us if it keeps happening.')}</p>
    </main>
  );
}
