import { whatsappLink } from '../core/share.ts';
import * as ui from './styles.ts';
import { tr } from '../core/i18n.ts';

// on an Udhaar entry: 40 tall, outlined, as the entry's other buttons
const ENTRY = 'relative min-h-10 px-3 rounded-[10px] border border-control-line bg-transparent text-brand text-[14px] font-[650] active:bg-press';

// Opens WhatsApp with a message ready to send; the person picks who gets it there.
export function WhatsAppButton({ text, label, tone = 'ghost', size = 'md' }: Readonly<{ text: string; label?: string; tone?: 'solid' | 'ghost'; size?: 'md' | 'small' | 'row' | 'entry' }>) {
  return (
    <a className={(size === 'entry' ? ENTRY : size === 'row' ? ui.btn('outline', 'none', 'min-h-11 px-4 text-[15px]') : ui.btn(tone, size)) + ' inline-flex items-center justify-center text-center no-underline'} href={whatsappLink(text)} target="_blank" rel="noopener noreferrer">{label ?? tr('Share on WhatsApp')}</a>
  );
}
