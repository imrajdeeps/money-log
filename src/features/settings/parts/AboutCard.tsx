import { useApp } from '../../../data/context.tsx';
import { VERSION } from './shared.ts';
import { startTour } from '../../tour/index.ts';
import * as ui from '../../../ui/styles.ts';

export function AboutCard() {
  const app = useApp();
  return (
    <div className={ui.card()}>
      <h2>About</h2>
      <p className="text-muted text-[13px]">Money Log {VERSION}. Amounts are in rupees.</p>
      {app.storageKind === 'memory' && (
        <p className={ui.msg('bad')} role="alert">This browser would not let the app store data, so payments will be lost when you close it. Open it in a normal (not private) window.</p>
      )}
      <p className="text-muted text-[13px]"><b>Install:</b> on iPhone, open this page in Safari, tap Share, then Add to Home Screen. On Android, open it in Chrome, tap the menu, then Install app.</p>
      <div className={ui.btnRowOf('mt-3 mb-0')} data-tour="about-tour">
        <button type="button" className={ui.btn('ghost')} onClick={() => startTour('first')}>Take the tour</button>
        <button type="button" className={ui.btn('ghost')} onClick={() => startTour('news')}>What is new</button>
      </div>
    </div>
  );
}
