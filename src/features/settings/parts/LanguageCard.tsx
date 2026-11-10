import { LANGS, getLang, tr } from '../../../core/i18n.ts';
import { chooseLang } from '../../../data/lang.ts';
import * as ui from '../../../ui/styles.ts';

const SAMPLE: Record<string, string> = { en: 'Add expense', hi: 'खर्च जोड़ें', hinglish: 'Kharcha jodein' };

// The language of the whole app. Hindi is in Devanagari; Hinglish is Hindi in the Roman letters people write on WhatsApp.
// A text that has no translation yet shows in English.
export function LanguageCard() {
  const lang = getLang();
  return (
    <div className={ui.card()}>
      <h2>{tr('Language')}</h2>
      <p className="text-muted text-[13px]">{tr('The whole app changes at once. Your payments and category names stay as you typed them.')}</p>
      <div className={ui.chips} role="group" aria-label={tr('Language')}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" className={ui.chip} aria-pressed={lang === l.id} lang={l.html} onClick={() => chooseLang(l.id)}>{l.native}</button>
        ))}
      </div>
      <p className="text-muted text-[13px] mt-3">{SAMPLE[lang]}</p>
    </div>
  );
}
