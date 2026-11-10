// The mark of the app: a coin ring with a gradient rupee. It is the app icon without its square, so it can sit on any green.
// (index.html carries the same drawing as plain markup for the start screen, which shows before any script has run.)
export function Logo({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="64 64 384 384" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="logo-ink" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3f6a0" />
          <stop offset="1" stopColor="#b9de55" />
        </linearGradient>
      </defs>
      <circle cx="256" cy="256" r="196" fill="#ffffff" fillOpacity="0.06" />
      <circle className="animate-ring" cx="256" cy="256" r="196" fill="none" stroke="#c9e96a" strokeOpacity="0.55" strokeWidth="6" />
      <circle cx="256" cy="256" r="172" fill="none" stroke="#c9e96a" strokeOpacity="0.16" strokeWidth="2" />
      <path d="M120 372 L196 318 L246 346 L318 268 L392 214" fill="none" stroke="#c9e96a" strokeOpacity="0.22" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="none" stroke="url(#logo-ink)" strokeWidth="42" strokeLinecap="round" strokeLinejoin="round">
        <path d="M164 150 H352 M164 208 H352" />
        <path d="M164 150 H232 C292 150 312 184 312 208 C312 258 270 280 232 280 L336 392" />
      </g>
    </svg>
  );
}
