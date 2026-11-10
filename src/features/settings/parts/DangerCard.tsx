import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

export function DangerCard() {
  const app = useApp();
  async function erase() {
    const waiting = app.sync.pending;
    const warn = waiting ? '\n\n' + tr('{0} change{1} not reached the cloud and will be lost.', waiting, waiting === 1 ? ' has' : 's have') : '';
    if (!window.confirm(tr('Erase everything on this phone and sign out? Data already in the cloud is not touched.{0}', warn))) return;
    await app.eraseAll();
    app.toast(tr('This phone has been erased.'));
  }
  return (
    <div className={ui.card()}>
      <h2>{tr('Erase')}</h2>
      <p className="text-muted text-[13px]">{tr('Removes the payments, plan and sign-in stored on this phone. Use it before handing the phone to someone or signing in with another account.')}</p>
      <button type="button" className={ui.btn('danger', 'md', ui.inCard)} onClick={erase}>{tr('Erase everything on this phone')}</button>
    </div>
  );
}
