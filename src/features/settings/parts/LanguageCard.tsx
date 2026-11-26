import { useState } from 'react';
import { LANGS, getLang, tr } from '../../../core/i18n.ts';
import { chooseLang } from '../../../data/lang.ts';

// The language of the whole app, as on the design: three big buttons, the chosen one ticked and edged. Hindi is in Devanagari;
// Hinglish is Hindi in the Roman letters people write on WhatsApp. A text that has no translation yet shows in English.
export function LanguageCard() {
  const lang = getLang();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <h3 className="m-0 pt-1 text-[15px] font-[650] text-ink">{tr('Language')}</h3>
      <div className="flex flex-col gap-2" role="group" aria-label={tr('Language')}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" aria-pressed={lang === l.id} lang={l.html} onClick={() => { void chooseLang(l.id).then((ok) => setFailed(!ok)); }}
            className={lang === l.id
              ? 'min-h-14 px-4 rounded-[14px] border-2 border-brand bg-card text-ink text-[17px] font-[650] text-left cursor-pointer [font-family:inherit]'
              : 'min-h-14 px-4 rounded-[14px] border border-control-line bg-card text-ink text-[17px] font-[650] text-left cursor-pointer [font-family:inherit]'}>
            {lang === l.id ? `✓ ${l.native}` : l.native}
          </button>
        ))}
      </div>
      {failed && <p className="m-0 text-[13px] text-bad" role="alert">{tr('That language could not be loaded. Check your connection, or reload the app, and try again.')}</p>}
      <p className="m-0 text-[13px] leading-[18px] text-muted">{tr('The whole app changes at once. Your payments and category names stay as you typed them.')}</p>
    </>
  );
}
