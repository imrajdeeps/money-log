import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

// Signing out, as on the design: keep this phone's copy of the data (for signing back in as the same person), or erase it (before
// someone else uses the phone or another account signs in, because a phone holds one account's data). Erasing asks first.
export function SignOutPanel() {
  const app = useApp();
  const pending = app.sync.pending;
  return (
    <div className={ps.card + ' gap-2.5'} role="group" aria-label={tr('Sign out')}>
      <h3 className={ps.title}>{tr('Sign out')}</h3>
      <p className={ps.note}>{tr('Choose what happens to the payments on this phone.')}</p>
      {pending > 0 && (
        <p className={ui.msg('bad')} role="alert">
          {tr('{0} change{1} not reached the cloud. Erasing loses {2}; signing out and keeping the data does not.', pending, pending === 1 ? ' has' : 's have', pending === 1 ? 'it' : 'them')}
        </p>
      )}
      <button type="button" className={ui.btn('outline', 'none', ps.second)} onClick={() => { void app.signOut(); }}>{tr('Sign out and keep them here')}</button>
      <button type="button" className={ui.btn('dangerOutline', 'none', ps.second)} onClick={async () => {
        if (!window.confirm(tr('Sign out and erase this phone\'s copy? Everything already in the cloud stays there and comes back when you sign in again.'))) return;
        await app.eraseAll(); app.toast(tr('Signed out and erased this phone.'));
      }}>{tr('Sign out and erase them from this phone')}</button>
    </div>
  );
}
