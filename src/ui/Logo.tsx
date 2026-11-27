// The mark of the app (version 2.1, the owner's choice C, "Hisaab barabar"): two ledger lines and a tick in lime on the deep green
// square, meaning written down, and settled. The same drawing as the home-screen icon (public/icons/icon.svg, and the PNGs made from it)
// and the start screen in index.html. Lines only, so it needs no font and looks the same everywhere.
export function Logo({ size = 96, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#104a30" />
      <g transform="translate(95.35 90.31) scale(12.6)" fill="none" stroke="#c9e96a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h14M5 11.5h8M12.5 16.5l2.8 2.8 5.2-5.8" />
      </g>
    </svg>
  );
}
