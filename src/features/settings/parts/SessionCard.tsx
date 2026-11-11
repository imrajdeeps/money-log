import { useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { SignOutPanel } from './SignOutPanel.tsx';
import * as ui from '../../../ui/styles.ts';
import { tr } from '../../../core/i18n.ts';

// At the top of Settings when signed in: who, and Sign out (with the choice of keeping or erasing this phone's copy).
export function SessionCard() {
  const app = useApp();
  const [leaving, setLeaving] = useState(false);
  return (
    <div className={ui.card()}>
      <p className="m-0 [overflow-wrap:anywhere]">{tr('Signed in as')}{' '}<b>{app.sync.email}</b></p>
      <div className={ui.btnRowOf('mt-2.5 mb-0')}>
        <button type="button" className={ui.btn('ghost')} aria-expanded={leaving} onClick={() => setLeaving(!leaving)}>{tr('Sign out')}</button>
      </div>
      {leaving && <SignOutPanel onCancel={() => setLeaving(false)} />}
    </div>
  );
}
