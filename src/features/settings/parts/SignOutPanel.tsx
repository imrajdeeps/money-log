import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

// The choice after "Sign out". Signing out can keep this phone's copy of the data (for signing back in as the same person); another
// account needs it erased first, because a phone holds one account's data.
export function SignOutPanel({ onCancel }: Readonly<{ onCancel: () => void }>) {
  const app = useApp();
  const pending = app.sync.pending;
  const lost = pending > 0 && (
    <p className={ui.msg('bad')} role="alert">
      {tr('{0} change{1} not reached the cloud. Erasing loses {2}; signing out and keeping the data does not.', pending, pending === 1 ? ' has' : 's have', pending === 1 ? 'it' : 'them')}
    </p>
  );
  return (
    <div className={ui.newCat} role="group" aria-label={tr('Sign out')}>
      <p><b>{tr('Also erase this phone\'s copy of your data?')}</b></p>
      <p className="text-muted text-[13px]">
        {tr('Erase it before someone else uses this phone or you sign in with another account. Everything already in the cloud stays there and comes back when you sign in again. Keep it if this is still your phone and you will sign back in.')}
      </p>
      {lost}
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={() => { void app.signOut(); }}>{tr('Sign out, keep the data')}</button>
      </div>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn('danger')} onClick={async () => { await app.eraseAll(); app.toast('Signed out and erased this phone.'); }}>{tr('Sign out and erase this phone')}</button>
      </div>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn('ghost')} onClick={onCancel}>{tr('Cancel')}</button>
      </div>
    </div>
  );
}
