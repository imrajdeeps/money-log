import { Logo } from './Logo.tsx';
import { tr } from '../core/i18n.ts';

// The start screen: the mark with a faint lime ring that turns while the payments are read from the phone, on the page's own
// colour (light or dark, set before the first paint). It fades away (leaving) once the app is ready. index.html carries the same
// markup, so there is no blank moment before the first script has run.
export function Splash({ leaving = false }: Readonly<{ leaving?: boolean }>) {
  return (
    <div
      className={`splash fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-bg text-ink transition-opacity duration-300${leaving ? ' pointer-events-none opacity-0' : ''}`}
      role="status"
      aria-label={tr('Opening Hisaab')}
    >
      <div className="relative w-[136px] h-[136px] flex items-center justify-center animate-splash-in">
        <svg className="absolute inset-0" width="136" height="136" viewBox="0 0 136 136" aria-hidden="true" focusable="false">
          <circle cx="68" cy="68" r="64" fill="none" stroke="#c9e96a" strokeOpacity="0.25" strokeWidth="3" />
          <circle className="animate-ring origin-center [transform-box:fill-box]" cx="68" cy="68" r="64" fill="none" stroke="#c9e96a" strokeWidth="3" strokeDasharray="100 302" strokeLinecap="round" />
        </svg>
        <Logo size={96} />
      </div>
      <p className="m-0 text-[26px] font-bold tracking-[-0.01em]">{tr('Hisaab')}</p>
      <p className="m-0 text-sm text-muted">{tr('Opening your payments…')}</p>
    </div>
  );
}
