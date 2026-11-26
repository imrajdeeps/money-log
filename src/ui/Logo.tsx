// The mark of the app: the letter ह (the first letter of हिसाब) in lime on the deep green square, the same drawing as the
// home-screen icon (public/icons/icon.svg). The outline comes from Noto Sans Devanagari ExtraBold (SIL Open Font License), so it
// looks the same on every phone whatever fonts it has. index.html carries the same drawing for the start screen.
const HA = 'M350 47Q368 61 378.0 76.0Q388 91 388 107Q388 128 369.0 141.0Q350 154 309 154Q260 154 233.5 136.0Q207 118 207 86Q207 60 229.0 38.5Q251 17 298.5 -3.5Q346 -24 422 -49L359 -169Q250 -140 182.0 -102.5Q114 -65 82.5 -18.0Q51 29 51 84Q51 151 87 193Q95 202 105 211Q83 230 71 250Q50 283 50 319Q50 382 97.0 415.0Q144 448 230 448H348V498H0V622H592V498H503V330H254Q227 330 215.5 321.0Q204 312 204 295Q204 281 216 268Q218 266 220 263Q265 273 317 273Q397 273 447.0 251.0Q497 229 520.0 193.0Q543 157 543 113Q543 75 528.0 42.5Q513 10 481 -21Z';

export function Logo({ size = 96, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#104a30" />
      <path transform="translate(143.74 347.90) scale(0.37927 -0.37927)" fill="#c9e96a" d={HA} />
    </svg>
  );
}
