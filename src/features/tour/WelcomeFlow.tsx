import { useState } from 'react';
import { LANGS, getLang, tr } from '../../core/i18n.ts';
import { chooseLang } from '../../data/lang.ts';
import { useLang } from '../../data/useLang.ts';
import * as ui from '../../ui/styles.ts';

export type StartChoice = 'track' | 'split' | 'both';

const CHOICES: readonly { id: StartChoice; title: () => string; text: () => string }[] = [
  { id: 'track', title: () => tr('Track my spending'), text: () => tr('Log what you spend, see it against a budget, set goals.') },
  { id: 'split', title: () => tr('Split with others'), text: () => tr('Family, a trip, flatmates or a partner: who paid, who owes whom.') },
  { id: 'both', title: () => tr('Both'), text: () => tr('Your own spending and shared groups, together.') },
];

// What a person new to the app sees first (instead of the nine-step tour, which stays in Settings, About): pick a language, say what you
// want to do, and land where you can start. Two short screens; skippable. Nothing is stored here except the language, in the usual place.
export function WelcomeFlow({ onStart, onSkip }: Readonly<{ onStart: (choice: StartChoice) => void; onSkip: () => void }>) {
  useLang(); // the card is drawn again when the language is changed on it
  const [step, setStep] = useState<1 | 2>(1);
  const lang = getLang();
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(0,0,0,0.62)] p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onSkip(); } }}
    >
      <div className="w-full max-w-[420px] rounded-2xl border border-line bg-card p-5 text-ink [box-shadow:0_12px_32px_-8px_rgba(0,0,0,0.5)]">
        <p className="m-0 mb-1 text-[13px] text-muted" aria-live="polite">{tr('Step {0} of {1}', step, 2)}</p>
        {step === 1 ? (
          <>
            <h2 id="welcome-title" className="m-0 mb-1.5">{tr('Welcome to Money Log')}</h2>
            <p className="m-0 mb-3 text-[15px]">{tr('Choose your language. You can change it later in Settings.')}</p>
            <div className={ui.chips} role="group" aria-label={tr('Language')}>
              {LANGS.map((l) => (
                <button key={l.id} type="button" className={ui.chip} aria-pressed={lang === l.id} lang={l.html} onClick={() => { void chooseLang(l.id); }}>{l.native}</button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2.5">
              <button type="button" className={ui.linkBtn + ' text-muted'} onClick={onSkip}>{tr('Skip')}</button>
              <button type="button" className={ui.btn('solid', 'small')} onClick={() => setStep(2)} autoFocus>{tr('Next')}</button>
            </div>
          </>
        ) : (
          <>
            <h2 id="welcome-title" className="m-0 mb-1.5">{tr('What do you want to do first?')}</h2>
            <div className="mt-2 flex flex-col gap-2">
              {CHOICES.map((c) => (
                <button key={c.id} type="button" className="w-full cursor-pointer rounded-xl border border-line bg-transparent p-3 text-left text-inherit [font:inherit] hover:border-accent" onClick={() => onStart(c.id)}>
                  <b className="block">{c.title()}</b>
                  <span className="text-[13px] text-muted">{c.text()}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 mb-0 text-[13px] text-muted">{tr('Your payments stay on this phone. Signing in adds a cloud copy, and a group lives in the app owner\'s database so its members can see what is shared there.')}</p>
            <div className="mt-3 flex items-center justify-between gap-2.5">
              <button type="button" className={ui.linkBtn + ' text-muted'} onClick={onSkip}>{tr('Skip')}</button>
              <button type="button" className={ui.btn('ghost', 'small')} onClick={() => setStep(1)}>{tr('Back')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
