import { useState } from 'react';
import { LANGS, getLang, tr } from '../../core/i18n.ts';
import { chooseLang } from '../../data/lang.ts';
import { useLang } from '../../data/useLang.ts';
import { Logo } from '../../ui/Logo.tsx';

export type StartChoice = 'track' | 'split';

// Each language's own line, so the choice reads in the language it names.
const SAMPLE: Record<string, string> = { en: 'Write down a payment in five seconds.', hi: 'पाँच सेकंड में भुगतान लिखें।', hinglish: 'Paanch second mein payment likhein.' };
const FRAME = 'fixed inset-0 z-[80] bg-bg text-ink overflow-auto flex justify-center';
const COLUMN = 'w-full max-w-[420px] min-h-full px-5 pt-6 pb-7 flex flex-col gap-4';
const BIG = 'mt-auto min-h-14 rounded-xl border-0 bg-primary text-primary-ink text-[17px] font-bold cursor-pointer [font-family:inherit] active:bg-primary-press';

// The line at the top of each step: which step, and Skip.
function StepBar({ step, onSkip }: Readonly<{ step: 1 | 2; onSkip: () => void }>) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-[13px] font-semibold text-muted" aria-live="polite">{tr('Step {0} of {1}', step, 2)}</span>
      <button type="button" className="min-h-11 px-2 border-0 bg-transparent text-brand text-[15px] font-[650] cursor-pointer [font-family:inherit]" onClick={onSkip}>{tr('Skip')}</button>
    </div>
  );
}

// A still picture of the Add form: what logging a payment looks like.
function AddPreview() {
  return (
    <div aria-hidden="true" className="mt-2 bg-card border border-line rounded-[20px] p-[18px] flex flex-col gap-3.5">
      <div className="flex items-center gap-1.5 border-[1.5px] border-accent rounded-[14px] px-3.5 py-2"><span className="text-[24px] text-muted">₹</span><span className="text-[34px] font-extrabold">450</span></div>
      <div className="flex flex-wrap gap-2">
        <span className="min-h-9 px-3 rounded-full bg-brand text-brand-ink text-[14px] font-semibold flex items-center">✓ {tr('Eating out')}</span>
        <span className="min-h-9 px-3 rounded-full border border-control-line text-[14px] font-semibold flex items-center">{tr('Groceries')}</span>
        <span className="min-h-9 px-3 rounded-full border border-control-line text-[14px] font-semibold flex items-center">{tr('Transport')}</span>
      </div>
      <span className="min-h-11 rounded-xl bg-primary text-primary-ink text-[15px] font-bold flex items-center justify-center">{tr('Save payment')}</span>
    </div>
  );
}

// What a person new to the app sees first, as on the design (the full tour stays in Settings, About): pick a language, then see how a
// payment is written down and start with the first one. Two full screens; skippable. Nothing is stored here except the language.
export function WelcomeFlow({ onStart, onSkip }: Readonly<{ onStart: (choice: StartChoice) => void; onSkip: () => void }>) {
  useLang(); // drawn again when the language is changed here
  const [step, setStep] = useState<1 | 2>(1);
  const lang = getLang();
  return (
    <div className={FRAME} role="dialog" aria-modal="true" aria-labelledby="welcome-title" onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onSkip(); } }}>
      {step === 1 ? (
        <div className={COLUMN}>
          <StepBar step={1} onSkip={onSkip} />
          <Logo size={56} className="mt-6" />
          <h1 id="welcome-title" className="m-0 text-[28px] leading-[34px] font-[750]">{tr('Welcome to Hisaab')}</h1>
          <p className="m-0 text-[16px] leading-6 text-muted">{tr('Which language should it speak? You can change this any time in Settings.')}</p>
          <div className="flex flex-col gap-2.5 pt-2" role="group" aria-label={tr('Language')}>
            {LANGS.map((l) => (
              <button key={l.id} type="button" lang={l.html} aria-pressed={lang === l.id} onClick={() => { void chooseLang(l.id); }}
                className={lang === l.id
                  ? 'min-h-[76px] text-left px-4 py-3 rounded-card border-2 border-brand bg-card text-ink cursor-pointer [font-family:inherit] flex flex-col gap-0.5'
                  : 'min-h-[76px] text-left px-4 py-3 rounded-card border border-control-line bg-card text-ink cursor-pointer [font-family:inherit] flex flex-col gap-0.5'}>
                <span className="text-[20px] font-bold">{l.native}</span><span className="text-[14px] text-muted">{SAMPLE[l.id]}</span>
              </button>
            ))}
          </div>
          <button type="button" className={BIG} onClick={() => setStep(2)}>{tr('Continue')}</button>
        </div>
      ) : (
        <div className={COLUMN}>
          <StepBar step={2} onSkip={onSkip} />
          <h1 id="welcome-title" className="mt-6 mb-0 text-[28px] leading-[34px] font-[750]">{tr('Write down your first payment')}</h1>
          <p className="m-0 text-[16px] leading-6 text-muted">{tr('Type what you spent, tap a category, tap Save. About five seconds. It stays on this phone unless you turn on sync.')}</p>
          <AddPreview />
          <button type="button" className={BIG} onClick={() => onStart('track')}>{tr('Add your first expense')}</button>
        </div>
      )}
    </div>
  );
}
