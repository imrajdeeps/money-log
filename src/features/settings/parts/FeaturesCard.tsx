import { useApp } from '../../../data/context.tsx';
import { FEATURES } from '../../../core/featureKinds.ts';
import type { Feature } from '../../../core/features.ts';
import { FEATURE_NAMES, FEATURE_TEXT } from '../featureNames.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

// One part's switch. Net worth lives inside Plan: it sits indented under it and cannot be switched while Plan is off.
function FeatureRow({ feature, first }: Readonly<{ feature: Feature; first: boolean }>) {
  const app = useApp();
  const insidePlan = feature === 'worth';
  const locked = insidePlan && !app.chosenFeatures.has('plan');
  const name = tr(FEATURE_NAMES[feature]);
  return (
    <label className={ui.cx('grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center min-h-[76px] py-2', insidePlan && 'pl-5', locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer', !first && 'border-t border-line')}>
      <span className="flex flex-col gap-0.5">
        <span className="text-[16px] font-semibold">{name}</span>
        <span className="text-[13px] leading-[18px] text-muted">{locked ? tr('Part of Plan: turn Plan on first.') : tr(FEATURE_TEXT[feature])}</span>
      </span>
      <input type="checkbox" role="switch" className={ui.switchBox} aria-label={name} checked={app.features.has(feature)} disabled={locked}
        onChange={(e) => { void app.setFeature(feature, e.target.checked); }} />
    </label>
  );
}

// Settings, Features (version 2.1): the parts of Hisaab a person turns on. Off only hides a part; nothing is deleted.
export function FeaturesCard() {
  const app = useApp();
  const hidden = FEATURES.filter((f) => !app.features.has(f)).map((f) => tr(FEATURE_NAMES[f]));
  return (
    <>
      <p className={ps.note}>{tr('Turn on the parts of Hisaab you want. Groups, the Overview, Month and Add are always there. Turning a part off only hides it.')}</p>
      <div className={ps.listCard}>
        {FEATURES.map((f, i) => <FeatureRow key={f} feature={f} first={i === 0} />)}
      </div>
      <p className="m-0 bg-press rounded-xl p-3 text-[14px] leading-5 text-ink" role="status">
        {hidden.length > 0 ? tr('Hidden now: {0}. Nothing is deleted: turn a part on and it comes back as it was.', hidden.join(', ')) : tr('Everything is on.')}
      </p>
      <p className={ps.small}>{tr('These choices follow your account to your other devices when you sync. They are never shared with your groups.')}</p>
    </>
  );
}
