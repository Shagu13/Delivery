import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { claimScannedParcels, scanParcelToClaim } from '../../api/scan';
import type { ScannedOrder } from '../../api/scan';
import { CameraScanner } from '../../components/ui/CameraScanner';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useLanguage } from '../../contexts/useLanguage';
import { useScanSession } from '../../hooks/useScanSession';
import './CourierScanPage.css';

interface Props {
  token: string;
  /** Scopes the saved in-progress list to this courier on a shared phone. */
  username: string;
  /** Called with the ids just before the claim is sent, so the dashboard doesn't pop a
   *  "new order" alert for parcels the courier is taking themselves. */
  onBeforeClaim: (orderIds: string[]) => void;
  /** Called after a claim finishes so the dashboard refreshes the Deliveries tab. */
  onClaimed: (assignedCount: number) => void;
}

interface Notice {
  kind: 'ok' | 'error';
  text: string;
}

interface ClaimResult {
  assigned: number;
  failed: { trackingNumber: string; error: string }[];
}

// Start → scan → Finish: scanned warehouse parcels collect in a list on the phone and nothing is
// assigned until Finish, so a mis-scan is just removed from the list. The list is kept in
// localStorage so a phone lock or an app switch mid-scan doesn't lose it.
export function CourierScanPage({ token, username, onBeforeClaim, onClaimed }: Props) {
  const { t } = useLanguage();
  const session = useScanSession(`delivery_courier_scan_${username}`);
  const [cameraOn, setCameraOn] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const scan = useMutation({
    mutationFn: (tracking: string) => scanParcelToClaim(token, tracking),
    onSuccess: (order: ScannedOrder) => {
      session.add(order);
      setNotice({ kind: 'ok', text: `${order.trackingNumber} · ${order.recipientCity}, ${order.recipientDistrict}` });
    },
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
  });

  const claim = useMutation({
    mutationFn: (orderIds: string[]) => claimScannedParcels(token, orderIds),
    onSuccess: res => {
      const failed = res.failed.map(f => ({
        trackingNumber: session.items.find(i => i.orderId === f.orderId)?.trackingNumber ?? f.orderId,
        error: f.error,
      }));
      // Everything attempted leaves the list: taken ones are now deliveries, refused ones are
      // reported below (someone else got them first) and can't be retried from here.
      session.clear();
      setCameraOn(false);
      setNotice(null);
      setResult({ assigned: res.succeeded.length, failed });
      onClaimed(res.succeeded.length);
    },
    onError: (e: Error) => setNotice({ kind: 'error', text: e.message }),
  });

  const handleCode = (raw: string) => {
    const value = raw.trim().toUpperCase();
    if (!value) return;
    if (session.has(value)) {
      setNotice({ kind: 'error', text: `${value} — ${t.scanDuplicate}` });
      return;
    }
    scan.mutate(value);
  };

  const start = () => {
    setResult(null);
    setNotice(null);
    setCameraOn(true);
  };

  const finish = () => {
    const ids = session.items.map(i => i.orderId);
    onBeforeClaim(ids);
    claim.mutate(ids);
  };

  const hasItems = session.items.length > 0;

  return (
    <div className="dashboard__section cscan">
      <h2 className="dashboard__title">{t.cdScanTitle}</h2>
      <p className="cscan__hint">{t.cdScanHint}</p>

      {cameraOn
        ? <CameraScanner onDetect={handleCode} onClose={() => setCameraOn(false)} />
        : (
          <button type="button" className="cscan-btn cscan-btn--primary" onClick={start} disabled={claim.isPending}>
            {hasItems ? t.cdScanResume : t.cdScanStart}
          </button>
        )}

      {notice && <div className={`cscan-notice cscan-notice--${notice.kind}`} role="status">{notice.text}</div>}

      {result && (
        <section className="cscan-card">
          <p className="cscan-card__title cscan-card__title--ok">{t.cdScanAssigned}: {result.assigned}</p>
          {result.failed.length > 0 && (
            <div className="cscan-notice cscan-notice--error">
              <strong>{t.cdScanNotTaken}:</strong>
              <ul className="cscan-failed">
                {result.failed.map(f => <li key={f.trackingNumber}>{f.trackingNumber} — {f.error}</li>)}
              </ul>
            </div>
          )}
        </section>
      )}

      {hasItems && (
        <section className="cscan-card">
          <header className="cscan-card__head">
            <span className="cscan-card__title">{t.scanTotal}: {session.items.length}</span>
            <button type="button" className="cscan-link" onClick={() => setConfirmDiscard(true)} disabled={claim.isPending}>
              {t.scanClear}
            </button>
          </header>
          <ul className="cscan-list">
            {session.items.map(o => (
              <li key={o.orderId} className="cscan-row">
                <div className="cscan-row__main">
                  <span className="cscan-row__track">{o.trackingNumber}</span>
                  <span className="cscan-row__addr">{o.recipientCity}, {o.recipientDistrict}, {o.recipientAddress}</span>
                </div>
                <button type="button" className="cscan-row__remove" aria-label={t.scanRemove}
                  disabled={claim.isPending} onClick={() => session.remove(o.orderId)}>✕</button>
              </li>
            ))}
          </ul>
          <button type="button" className="cscan-btn cscan-btn--primary" onClick={finish} disabled={claim.isPending}>
            {claim.isPending ? t.cdScanFinishing : `${t.cdScanFinish} (${session.items.length})`}
          </button>
        </section>
      )}

      <ConfirmDialog
        open={confirmDiscard}
        title={t.scanClear}
        message={t.scanClearConfirm}
        variant="danger"
        onConfirm={() => { session.clear(); setCameraOn(false); setNotice(null); setConfirmDiscard(false); }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
