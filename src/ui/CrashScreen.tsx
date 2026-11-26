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
    <main className="mx-auto flex min-h-dvh max-w-[528px] flex-col justify-center gap-3 px-4 py-8 text-ink">
      <h1 className="m-0 text-[24px]">{tr('Something went wrong')}</h1>
      <p className="m-0">{tr('Hisaab hit a problem it could not recover from. Your payments are kept on this phone and are not lost. Reloading usually fixes it.')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ui.btn('solid', 'small')} onClick={() => { window.location.reload(); }}>{tr('Reload')}</button>
        <CopyReport />
      </div>
      <p className={`m-0 ${ui.mutedSmall}`}>{tr('The report holds the error, the app version, the page name and a few facts about this browser. It is not meant to hold any of your payments or details, and nothing is sent anywhere unless you send it.')}</p>
    </main>
  );
}
