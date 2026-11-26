import { dismissUpdate, useUpdateReady } from '../data/updates.ts';
import { tr } from '../core/i18n.ts';

/** Offered when a newer version of the app has taken over behind the open page. The person decides when to reload. */
export function UpdateBar() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-[calc(96px+env(safe-area-inset-bottom))] z-[70] mx-auto max-w-[528px] min-h-14 pl-4 pr-1.5 py-1.5 rounded-[14px] bg-ink text-bg flex items-center gap-2 [box-shadow:var(--shadow-pop)] lg:bottom-6" title={tr('Reload to use it. A payment you are half-way through typing is lost on reload, so finish that first.')}>
      <span className="flex-1 text-[15px] font-semibold">{tr('A new version of Hisaab is ready')}</span>
      <button type="button" className="min-h-11 px-3 rounded-[10px] border-0 bg-transparent text-bg opacity-80 text-[15px] font-semibold cursor-pointer [font-family:inherit]" onClick={dismissUpdate}>{tr('Later')}</button>
      <button type="button" className="min-h-11 px-3.5 rounded-[10px] border-0 bg-primary text-primary-ink text-[15px] font-bold cursor-pointer [font-family:inherit]" onClick={() => { window.location.reload(); }}>{tr('Reload')}</button>
    </div>
  );
}
