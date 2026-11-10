import { useApp } from '../../../data/context.tsx';
import * as ui from '../../../ui/styles.ts';

export function DangerCard() {
  const app = useApp();
  async function erase() {
    const waiting = app.sync.pending;
    const warn = waiting ? `\n\n${waiting} change${waiting === 1 ? ' has' : 's have'} not reached the cloud and will be lost.` : '';
    if (!window.confirm(`Erase everything on this phone and sign out? Data already in the cloud is not touched.${warn}`)) return;
    await app.eraseAll();
    app.toast('This phone has been erased.');
  }
  return (
    <div className={ui.card()}>
      <h2>Erase</h2>
      <p className="text-muted text-[13px]">Removes the payments, plan and sign-in stored on this phone. Use it before handing the phone to someone or signing in with another account.</p>
      <button type="button" className={ui.btn('danger', 'md', ui.inCard)} onClick={erase}>Erase everything on this phone</button>
    </div>
  );
}
