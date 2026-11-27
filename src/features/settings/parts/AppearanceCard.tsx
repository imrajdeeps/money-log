import { useTheme } from '../theme.ts';
import { soundsOn } from '../../../data/phonePrefs.ts';
import type { ThemeChoice } from '../theme.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

const LOOKS: { id: ThemeChoice; label: string; sub: string }[] = [
  { id: 'system', label: 'Match my device', sub: 'Light by day, dark by night, as your device does' },
  { id: 'light', label: 'Light', sub: '' },
  { id: 'dark', label: 'Dark', sub: '' },
];

// Light, dark or as the phone does (a round choice for each), and the soft sounds (a switch). Kept on this phone.
export function AppearanceCard() {
  const { choice, set } = useTheme();
  const sounds = soundsOn.use();
  return (
    <>
      <div className={ps.listCard + ' py-1'} role="radiogroup" aria-label={tr('Theme')}>
        {LOOKS.map((l, i) => (
          <button key={l.id} type="button" role="radio" aria-checked={choice === l.id} onClick={() => set(l.id)}
            className={ui.cx('w-full grid grid-cols-[26px_minmax(0,1fr)] gap-3 items-center min-h-16 p-0 border-0 bg-transparent text-ink text-left cursor-pointer [font-family:inherit]', i > 0 && 'border-t border-line')}>
            <span className={ui.cx('w-[22px] h-[22px] rounded-full flex items-center justify-center', choice === l.id ? 'border-2 border-brand' : 'border-[1.5px] border-field-line')} aria-hidden="true">{choice === l.id && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
            <span className="flex flex-col"><span className="text-[16px] font-semibold">{tr(l.label)}</span>{l.sub && <span className="text-[13px] text-muted">{tr(l.sub)}</span>}</span>
          </button>
        ))}
      </div>
      <h3 className="m-0 pt-1 text-[15px] font-[650] text-ink">{tr('Sound')}</h3>
      <div className={ps.listCard + ' py-1'}>
        <label className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[76px] cursor-pointer">
          <span className="flex flex-col gap-0.5"><span className="text-[16px] font-semibold">{tr('Play soft sounds')}</span><span className="text-[13px] leading-[18px] text-muted">{tr('A short tick when a message appears, a gentle chime for a new note. Quiet when your phone is on silent.')}</span></span>
          <input type="checkbox" role="switch" className={ui.switchBox} aria-label={tr('Play soft sounds')} checked={sounds} onChange={(e) => soundsOn.save(e.target.checked)} />
        </label>
      </div>
    </>
  );
}
