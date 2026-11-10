import { useSyncExternalStore } from 'react';
import { currentLang, subscribeLang } from './lang.ts';
import type { Lang } from '../core/i18n.ts';

// The chosen language; the screen is drawn again from the top when it changes (see app/App.tsx).
export const useLang = (): Lang => useSyncExternalStore(subscribeLang, currentLang);
