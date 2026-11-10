import { Logo } from './Logo.tsx';

// The start screen: the logo on the app's green while the payments are read from the phone. It fades away (leaving) once the
// app is ready. index.html carries the same markup, so there is no blank moment before the first script has run.
export function Splash({ leaving = false }: { leaving?: boolean }) {
  return (
    <div
      className={`splash fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[linear-gradient(160deg,#1b6b47_0%,#124d33_55%,#0a3322_100%)] text-[#ffffff] transition-opacity duration-300${leaving ? ' pointer-events-none opacity-0' : ''}`}
      role="status"
      aria-label="Opening Money Log"
    >
      <Logo size={112} className="animate-splash-in" />
      <p className="m-0 text-[26px] font-bold tracking-[-0.01em]">Money Log</p>
      <p className="m-0 text-sm text-[#ffffffb3]">Opening your payments…</p>
    </div>
  );
}
