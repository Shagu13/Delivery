import type { ScannedOrder } from '../../api/scan';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  courierName: string;
  orders: ScannedOrder[];
  downloading: boolean;
  onDownload: () => void;
  onRemove: (orderId: string) => void;
}

// One courier's block on the Scan screen: their scanned packages + their own Excel button.
export function ScanCourierGroup({ courierName, orders, downloading, onDownload, onRemove }: Props) {
  const { t } = useLanguage();

  return (
    <section className="scan-group">
      <header className="scan-group__head">
        <h3 className="scan-group__name">{courierName}</h3>
        <span className="scan-group__count">{orders.length}</span>
        <button type="button" className="scan-btn" disabled={downloading} onClick={onDownload}>
          {downloading ? t.scanDownloading : t.scanDownloadCourier}
        </button>
      </header>
      <ul className="scan-list">
        {orders.map(o => (
          <li key={o.orderId} className="scan-row">
            <div className="scan-row__main">
              <span className="scan-row__track">{o.trackingNumber}</span>
              <span className="scan-row__who">{o.recipientName} · {o.recipientPhone}</span>
              <span className="scan-row__addr">{o.recipientCity}, {o.recipientDistrict}, {o.recipientAddress}</span>
            </div>
            {o.amountToCollect > 0 && <span className="scan-row__cod">₾{o.amountToCollect.toFixed(2)}</span>}
            <button type="button" className="scan-row__remove" aria-label={t.scanRemove} onClick={() => onRemove(o.orderId)}>✕</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
