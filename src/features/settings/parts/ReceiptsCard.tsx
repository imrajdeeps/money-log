import { useApp } from '../../../data/context.tsx';
import { quota, sizeText, usedBytes } from '../../../core/receipts.ts';
import * as ui from '../../../ui/styles.ts';

export function ReceiptsCard() {
  const app = useApp();
  const used = usedBytes(app.receipts);
  const q = quota(used);
  const count = app.receipts.filter((r) => !r.deleted_at).length;
  return (
    <div className={ui.card()}>
      <h2>Receipt photos</h2>
      <p className="text-muted text-[13px]">
        {count} photo{count === 1 ? '' : 's'} · {sizeText(used)} in the cloud, of the free 1 GB (this counts every photo you can see, yours and shared ones, so it is an estimate for the whole project).
        Each photo is shrunk to at most 1,600 pixels and 1 MB, and its location and camera details are removed before upload. An account can keep up to 300 photos.
      </p>
      <div className={ui.bar} aria-hidden="true"><i className={ui.barFill(q.level === 'ok' ? 'good' : 'bad')} style={{ width: `${q.pct}%` }} /></div>
      {q.level !== 'ok' && (
        <p className={ui.msg('bad')} role="alert">
          {q.level === 'full' ? 'The free storage is full.' : 'The free storage is more than 80% full.'} Delete old photos you no longer need, or upgrade the Supabase plan.
        </p>
      )}
      <p className="text-muted text-[13px]">Photos are not part of the backup file or the spreadsheet export.</p>
    </div>
  );
}
