// Small line icons drawn inline (the page loads nothing from elsewhere). They take the text colour, so they follow the
// light and dark themes, and they are always decorative: the button or link around them carries the words.
const PATHS = {
  home: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5M10 20v-5.5h4V20',
  month: 'M6.5 5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3.5 10h17M8 3v4M16 3v4',
  plan: 'M4 6.5l1.5 1.5L8.5 5M4 12.5l1.5 1.5 3-3M4 18.5l1.5 1.5 3-3M12 7h8M12 13h8M12 19h8',
  groups: 'M9 11.7a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4zM3 19.5c.6-3.3 3-5 6-5s5.4 1.7 6 5M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM16.5 14.5c2.3 0 4 1.4 4.5 4',
  settings: 'M18.89 9.89 21.42 10.17v3.66l-2.53.28-.53 1.27 1.6 1.99-2.59 2.59-1.99-1.6-1.27.53-.28 2.53h-3.66l-.28-2.53-1.27-.53-1.99 1.6-2.59-2.59 1.6-1.99-.53-1.27-2.53-.28v-3.66l2.53-.28.53-1.27-1.6-1.99 2.59-2.59 1.99 1.6 1.27-.53.28-2.53h3.66l.28 2.53 1.27.53 1.99-1.6 2.59 2.59-1.6 1.99zM12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z', // a toothed cog: the older wheel with spokes read as a sun next to the theme switch
  plus: 'M12 5v14M5 12h14',
  search: 'M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM16 16l4 4',
  camera: 'M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4zM12 16.8a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6z',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  dotsFill: 'M5 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM19 10.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
  close: 'M6 6l12 12M18 6 6 18',
  backspace: 'M9 5h11v14H9l-6-7zM12.5 9.5l5 5M17.5 9.5l-5 5', // delete one digit (the lock screen's keypad)
  chevron: 'M9 5l7 7-7 7',
  skip: 'M5 12h14M13 6l6 6-6 6', // 2.2: skip a month of a repeat
  back: 'M15 5l-7 7 7 7',
  down: 'M6 9.5l6 6 6-6',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  calendar: 'M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M9 14.5l2 2 4-4',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12h.01',
  bell: 'M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21a2 2 0 0 0 4 0',
  edit: 'M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l.9 12.5a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M10 11v5.5M14 11v5.5',
  udhaar: 'M4 8h14l-3.5-3.5M20 16H6l3.5 3.5', // money going one way and coming back (Udhaar in the bottom bar when Plan is off)
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01', // All payments in the bottom bar when Plan and Udhaar are off
} as const;

export type IconName = keyof typeof PATHS;

// The part of an icon that is a closed shape, filled softly when the icon says "you are here" (the open tab).
const FILLS: Partial<Record<IconName, string>> = {
  home: 'M5.5 9.5 12 4l6.5 5.5V20h-13z',
  month: 'M6.5 5h11a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
  groups: 'M9 11.7a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
  settings: PATHS.settings,
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
};

export function Icon({ name, size = 22, duotone = false, stroke = 1.75 }: Readonly<{ name: IconName; size?: number; duotone?: boolean; stroke?: number }>) {
  return (
    <svg className="block flex-none" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {duotone && FILLS[name] && <path d={FILLS[name]} fill="currentColor" fillOpacity="0.18" stroke="none" />}
      {name === 'dotsFill' ? <path d={PATHS[name]} fill="currentColor" stroke="none" /> : <path d={PATHS[name]} />}
    </svg>
  );
}
