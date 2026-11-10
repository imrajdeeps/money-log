import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';

// The choice after "Sign out" or "Switch account". Signing out can keep this phone's copy of the data (for signing back in
// as the same person); switching to another account needs it erased first, because a phone holds one account's data.
export function SignOutPanel({ kind, onCancel, onSwitched }: { kind: 'out' | 'switch'; onCancel: () => void; onSwitched?: () => void }) {
  const app = useApp();
  const pending = app.sync.pending;
  const lost = pending > 0 && (
    <p className={ui.msg('bad')} role="alert">
      {pending} change{pending === 1 ? ' has' : 's have'} not reached the cloud. Erasing loses {pending === 1 ? 'it' : 'them'}; signing out and keeping the data does not.
    </p>
  );
  if (kind === 'switch') {
    return (
      <div className={ui.newCat} role="group" aria-label="Switch account">
        <p><b>Switch to another account?</b></p>
        <p className="text-muted text-[13px]">
          This phone holds the data of {app.sync.email ?? 'the account you are signed in with'}, and a phone can hold only one account's data. To use another
          account, this phone's copy is erased and you sign in again. Everything already in the cloud stays there and comes back when you sign in to that
          account. If you want a copy first, save a backup under Backup.
        </p>
        {lost}
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn('danger')} onClick={async () => { await app.eraseAll(); app.toast('Erased this phone. Sign in with the other account.'); onSwitched?.(); }}>Erase this phone and switch</button>
        </div>
        <div className={ui.btnRow}>
          <button type="button" className={ui.btn('ghost')} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className={ui.newCat} role="group" aria-label="Sign out">
      <p><b>Also erase this phone's copy of your data?</b></p>
      <p className="text-muted text-[13px]">
        Erase it before someone else uses this phone or you sign in with another account. Everything already in the cloud stays there
        and comes back when you sign in again. Keep it if this is still your phone and you will sign back in.
      </p>
      {lost}
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn()} onClick={() => { void app.signOut(); }}>Sign out, keep the data</button>
      </div>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn('danger')} onClick={async () => { await app.eraseAll(); app.toast('Signed out and erased this phone.'); }}>Sign out and erase this phone</button>
      </div>
      <div className={ui.btnRow}>
        <button type="button" className={ui.btn('ghost')} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
