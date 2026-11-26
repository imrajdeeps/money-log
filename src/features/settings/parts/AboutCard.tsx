import { useApp } from '../../../data/context.tsx';
import { VERSION } from './shared.ts';
import { startTour } from '../../tour/index.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

const LINK = 'min-h-11 px-0 border-0 bg-transparent text-brand text-[15px] font-semibold cursor-pointer [font-family:inherit]';

// About, as on the design: the version and the tours in lines, and how to install the app on a phone.
export function AboutCard() {
  const app = useApp();
  const ROW = 'flex justify-between items-center min-h-14 text-[15px]';
  return (
    <>
      {app.storageKind === 'memory' && (
        <p className={ui.msg('bad')} role="alert">{tr('This browser would not let the app store data, so payments will be lost when you close it. Open it in a normal (not private) window.')}</p>
      )}
      <ul className={ps.listCard + ' list-none m-0 [&>li+li]:border-t [&>li+li]:border-line'} data-tour="about-tour">
        <li className={ROW}><span>{tr('Version')}</span><span className="font-semibold">{VERSION}</span></li>
        <li className={ROW}><span>{tr('Take the tour')}</span><button type="button" className={LINK} onClick={() => startTour('first')}>{tr('Start')}</button></li>
        <li className={ROW}><span>{tr('What is new')}</span><button type="button" className={LINK} onClick={() => startTour('news')}>{tr('See')}</button></li>
        <li className={ROW}><span>{tr('Amounts')}</span><span className="font-semibold">{tr('In rupees')}</span></li>
      </ul>
      <div className={ps.card + ' gap-2'}>
        <h3 className={ps.title}>{tr('Install on your phone')}</h3>
        <p className={ps.note}>{tr('On Android: Chrome menu › Add to Home screen. On iPhone: Safari share button › Add to Home Screen. It then opens full screen and works offline.')}</p>
      </div>
    </>
  );
}
