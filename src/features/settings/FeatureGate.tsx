import type { ReactNode } from 'react';
import { useApp } from '../../data/context.tsx';
import type { Feature } from '../../core/features.ts';
import { FEATURE_NAMES } from './featureNames.ts';
import * as ui from '../../ui/styles.ts';
import { tr } from '../../core/i18n.ts';

// A page of a part that can be turned off (Settings, Features; version 2.1). While the part is on, the page; while it is off (a link, the
// back button, an old bookmark), a short card that says so and where to turn it on. heading: the page's own title, for pages that draw
// their heading themselves (Plan).
export function FeatureGate({ feature, heading, onOpen, children }: Readonly<{ feature: Feature; heading?: string; onOpen: () => void; children: ReactNode }>) {
  const app = useApp();
  if (app.features.has(feature)) return <>{children}</>;
  return (
    <div className="flex flex-col gap-4">
      {heading && <h2 className="m-0 text-[24px] leading-[30px] font-bold">{tr(heading)}</h2>}
      <section className="flex flex-col gap-2.5 bg-card border border-line rounded-card p-[18px]">
        <h3 className="m-0 text-[17px] font-bold text-ink">{tr('{0} is turned off', tr(FEATURE_NAMES[feature]))}</h3>
        <p className="m-0 text-[15px] leading-[22px] text-muted">{tr('Turn it on in Settings, Features. Anything you added is kept and comes back as it was.')}</p>
        <button type="button" className={ui.btn('solid', 'none', 'self-start min-h-12 px-[18px] text-[16px]')} onClick={onOpen}>{tr('Open Features')}</button>
      </section>
    </div>
  );
}
