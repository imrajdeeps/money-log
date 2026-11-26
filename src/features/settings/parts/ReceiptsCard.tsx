import { useApp } from '../../../data/context.tsx';
import { quota, sizeText, usedBytes } from '../../../core/receipts.ts';
import * as ui from '../../../ui/styles.ts';
import * as ps from './partStyles.ts';
import { tr } from '../../../core/i18n.ts';

// Receipt photos, as on the design: the space they use (of the free 1 GB in the cloud), and what happens to them.
export function ReceiptsCard() {
  const app = useApp();
  const used = usedBytes(app.receipts);
  const q = quota(used);
  const count = app.receipts.filter((r) => !r.deleted_at).length;
  return (
    <>
      <div className={ps.card + ' gap-2.5'}>
        <div className="flex justify-between items-baseline"><h3 className={ps.title}>{tr('Space used')}</h3><strong className="text-[16px] tabular-nums">{sizeText(used)}</strong></div>
        <span className="h-2 rounded-full bg-press flex overflow-hidden" aria-hidden="true"><span className={q.level === 'ok' ? 'rounded-full bg-brand' : 'rounded-full bg-bad'} style={{ width: `${Math.max(q.pct, used > 0 ? 2 : 0)}%` }} /></span>
        <p className={ps.note}>{tr('{0} photos. About {1}% of the free 1 GB in the cloud (every photo you can see counts, yours and shared ones).', count, Math.round(q.pct))}</p>
        {q.level !== 'ok' && (
          <p className={ui.msg('bad')} role="alert">{tr('{0} Delete old photos you no longer need, or upgrade the Supabase plan.', q.level === 'full' ? tr('The free storage is full.') : tr('The free storage is more than 80% full.'))}</p>
        )}
      </div>
      <div className={ps.card + ' gap-2.5'}>
        <h3 className={ps.title}>{tr('How photos are kept')}</h3>
        <p className={ps.note}>{tr('Each photo is shrunk to at most 1,600 pixels and 1 MB, and its location and camera details are removed before upload. An account can keep up to 300 photos. Photos are not part of the backup file. Removing a photo from its payment keeps the payment.')}</p>
      </div>
    </>
  );
}
