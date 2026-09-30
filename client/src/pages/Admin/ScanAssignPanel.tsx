import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchCouriers } from '../../api/couriers';
import { bulkAssignCourierToOrders } from '../../api/orders';
import { exportScanManifest } from '../../api/scan';
import type { ScannedOrder } from '../../api/scan';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../contexts/useLanguage';
import type { useScanSession } from '../../hooks/useScanSession';

interface Props {
  token: string;
  session: ReturnType<typeof useScanSession>;
  /** Hands the just-assigned packages to the Manifest list. */
  onAddToManifest: (orders: ScannedOrder[]) => void;
  onError: (message: string) => void;
}

interface AssignResult {
  courierId: string;
  courierName: string;
  assigned: ScannedOrder[];
  failed: { trackingNumber: string; error: string }[];
}

// Assign mode: the scanned (unassigned) packages wait in a list; the courier is chosen after
// scanning and one press assigns them all. The result panel chains into the Manifest flow.
export function ScanAssignPanel({ token, session, onAddToManifest, onError }: Props) {
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const [courierId, setCourierId] = useState('');
  const [result, setResult] = useState<AssignResult | null>(null);
  const [addedToManifest, setAddedToManifest] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const couriersQuery = useQuery({
    queryKey: ['admin', 'couriers'] as const,
    queryFn: () => fetchCouriers(token),
  });
  const couriers = (couriersQuery.data ?? []).filter(c => !c.isDeleted);

  const assign = useMutation({
    mutationFn: () => bulkAssignCourierToOrders(token, session.items.map(i => i.orderId), courierId),
    onSuccess: res => {
      const courier = couriers.find(c => c.courierId === courierId);
      const courierName = courier?.fullName ?? '';
      const assigned = session.items
        .filter(i => res.succeeded.includes(i.orderId))
        .map(i => ({ ...i, courierId, courierFullName: courierName, status: 'CourierAssignedToDeliver' }));
      const failed = res.failed.map(f => ({
        trackingNumber: session.items.find(i => i.orderId === f.orderId)?.trackingNumber ?? f.orderId,
        error: f.error,
      }));
      session.removeMany(res.succeeded);
      setAddedToManifest(false);
      setResult({ courierId, courierName, assigned, failed });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (e: Error) => onError(e.message),
  });

  const download = useMutation({
    mutationFn: (r: AssignResult) =>
      exportScanManifest(token, r.assigned.map(o => o.trackingNumber), lang, r.courierId),
    onError: (e: Error) => onError(e.message),
  });

  const addToManifest = (r: AssignResult) => {
    onAddToManifest(r.assigned);
    setAddedToManifest(true);
  };

  return (
    <>
      {result && (
        <section className="scan-result">
          <p className="scan-result__title">{t.scanAssignResult}: {result.assigned.length} → {result.courierName}</p>
          {result.failed.length > 0 && (
            <div className="scan-notice scan-notice--error">
              <strong>{t.scanAssignFailed}:</strong>
              <ul className="scan-result__failed">
                {result.failed.map(f => <li key={f.trackingNumber}>{f.trackingNumber} — {f.error}</li>)}
              </ul>
            </div>
          )}
          {result.assigned.length > 0 && (
            <div className="scan-toolbar">
              <button type="button" className="scan-btn scan-btn--primary" disabled={addedToManifest}
                onClick={() => addToManifest(result)}>
                {addedToManifest ? t.scanAddedToManifest : t.scanAddToManifest}
              </button>
              <button type="button" className="scan-btn" disabled={download.isPending}
                onClick={() => download.mutate(result)}>
                {download.isPending ? t.scanDownloading : t.scanDownloadCourier}
              </button>
              <button type="button" className="scan-btn" onClick={() => setResult(null)}>{t.scanDone}</button>
            </div>
          )}
        </section>
      )}

      {session.items.length === 0 ? (
        !result && <p className="scan-empty">{t.scanAssignEmpty}</p>
      ) : (
        <section className="scan-group">
          <header className="scan-group__head">
            <h3 className="scan-group__name">{t.scanTotal}</h3>
            <span className="scan-group__count">{session.items.length}</span>
            <button type="button" className="scan-btn" onClick={() => setConfirmClear(true)}>{t.scanClear}</button>
          </header>
          <div className="scan-assign-bar">
            <select className="scan-select" value={courierId} onChange={e => { setCourierId(e.target.value); e.target.blur(); }}
              aria-label={t.scanAssignCourier}>
              <option value="">{t.scanAssignSelectCourier}</option>
              {couriers.map(c => (
                <option key={c.courierId} value={c.courierId}>
                  {c.fullName}{c.assignedCity ? ` · ${c.assignedCity}` : ''}
                </option>
              ))}
            </select>
            <button type="button" className="scan-btn scan-btn--primary"
              disabled={!courierId || assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending ? t.scanAssigning : `${t.scanAssignButton} (${session.items.length})`}
            </button>
          </div>
          <ul className="scan-list">
            {session.items.map(o => (
              <li key={o.orderId} className="scan-row">
                <div className="scan-row__main">
                  <span className="scan-row__track">{o.trackingNumber}</span>
                  <span className="scan-row__who">{o.recipientName} · {o.recipientPhone}</span>
                  <span className="scan-row__addr">{o.recipientCity}, {o.recipientDistrict}, {o.recipientAddress}</span>
                </div>
                <button type="button" className="scan-row__remove" aria-label={t.scanRemove}
                  onClick={() => session.remove(o.orderId)}>✕</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={confirmClear}
        title={t.scanClear}
        message={t.scanClearConfirm}
        variant="danger"
        onConfirm={() => { session.clear(); setConfirmClear(false); }}
        onCancel={() => setConfirmClear(false)}
      />
    </>
  );
}
