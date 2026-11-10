import { useState } from 'react';
import { useApp } from '../../../data/context.tsx';
import { SignOutPanel } from './SignOutPanel.tsx';
import * as ui from '../../../ui/styles.ts';

// At the top of Settings when signed in: who, and Sign out / Switch account without opening Cloud sync.
export function SessionCard({ onSwitched }: { onSwitched: () => void }) {
  const app = useApp();
  const [panel, setPanel] = useState<'out' | 'switch' | null>(null);
  return (
    <div className={ui.card()}>
      <p className="m-0 [overflow-wrap:anywhere]">Signed in as <b>{app.sync.email}</b></p>
      <div className={ui.btnRowOf('mt-2.5 mb-0')}>
        <button type="button" className={ui.btn('ghost')} aria-expanded={panel === 'out'} onClick={() => setPanel(panel === 'out' ? null : 'out')}>Sign out</button>
        <button type="button" className={ui.btn('ghost')} aria-expanded={panel === 'switch'} onClick={() => setPanel(panel === 'switch' ? null : 'switch')}>Switch account</button>
      </div>
      {panel && <SignOutPanel kind={panel} onCancel={() => setPanel(null)} onSwitched={onSwitched} />}
    </div>
  );
}
