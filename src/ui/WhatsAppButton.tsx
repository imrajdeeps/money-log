import { whatsappLink } from '../core/share.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// Opens WhatsApp with a message ready to send; the person picks who gets it there.
export function WhatsAppButton({ text, label, tone = 'ghost' }: Readonly<{ text: string; label?: string; tone?: 'solid' | 'ghost' }>) {
  return (
    <a className={ui.btn(tone) + ' text-center no-underline'} href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">{label ?? tr('Share on WhatsApp')}</a>
  );
}
