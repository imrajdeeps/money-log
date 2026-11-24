import { dismissUpdate, useUpdateReady } from '../data/updates.ts';
import { tr } from '../core/i18n.ts';
import * as ui from './styles.ts';

/** Offered when a newer version of the app has taken over behind the open page. The person decides when to reload. */
export function UpdateBar() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-3 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-[528px] flex-col gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-[14px] text-ink shadow-lg lg:bottom-6">
      <span className="font-semibold">{tr('A new version of Money Log is ready.')}</span>
      <span className={ui.mutedSmall}>{tr('Reload to use it. A payment you are half-way through typing is lost on reload, so finish that first.')}</span>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ui.btn('solid', 'small')} onClick={() => { window.location.reload(); }}>{tr('Reload')}</button>
        <button type="button" className={ui.btn('ghost', 'small')} onClick={dismissUpdate}>{tr('Later')}</button>
      </div>
    </div>
  );
}
