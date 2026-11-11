import type { AdminPartnerOrder } from '../../api/partners';
import { useLanguage } from '../../contexts/useLanguage';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import './AdminPartnerOrdersPage.css';

interface Props { orders: AdminPartnerOrder[]; }

function money(v: number | null | undefined) {
  return v == null ? '—' : `${v.toFixed(2)} ₾`;
}

/** Table on desktop; each row collapses into a labelled card below 720px (see the CSS). */
export default function AdminPartnerOrdersTable({ orders }: Props) {
  const { t, lang } = useLanguage();

  return (
    <div className="apo__table-wrap">
      <table className="apo__table">
        <thead>
          <tr>
            <th>{t.apoColCreated}</th>
            <th>{t.apoColTracking}</th>
            <th>{t.apoColPartnerRef}</th>
            <th>{t.apoColPartner}</th>
            <th>{t.apoColRecipient}</th>
            <th>{t.apoColDestination}</th>
            <th>{t.apoColStatus}</th>
            <th>{t.apoColCod}</th>
            <th>{t.apoColFee}</th>
            <th>{t.apoColDelivered}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map(o => {
            const [bg, fg] = STATUS_COLORS[o.status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)'];
            const status = getStatusMeta(o.status, lang);
            return (
              <tr key={o.id}>
                <td data-label={t.apoColCreated}>{formatGeorgianDateTime(o.createdAt)}</td>
                <td data-label={t.apoColTracking}><code>{o.trackingNumber}</code></td>
                <td data-label={t.apoColPartnerRef}>{o.externalReference ?? '—'}</td>
                <td data-label={t.apoColPartner}>{o.partnerName || '—'}</td>
                <td data-label={t.apoColRecipient}>
                  {o.recipientName}
                  <div className="apo__sub">{o.recipientPhone}</div>
                </td>
                <td data-label={t.apoColDestination}>
                  {o.recipientCity}{o.recipientDistrict ? `, ${o.recipientDistrict}` : ''}
                </td>
                <td data-label={t.apoColStatus}>
                  <span className="apo__status" style={{ background: bg, color: fg }} title={status.description}>
                    {status.short}
                  </span>
                </td>
                <td data-label={t.apoColCod}>
                  {o.productPaymentStatus === 'NotPaid' ? money(o.amountToCollectForPackage) : '—'}
                </td>
                <td data-label={t.apoColFee}>
                  {money(o.companyServicePrice)}
                  <div className="apo__sub">
                    {o.whoPaysForCompanyService === 'Sender' ? t.apoPayerSender : t.apoPayerRecipient}
                  </div>
                </td>
                <td data-label={t.apoColDelivered}>
                  {o.deliveredAt ? formatGeorgianDateTime(o.deliveredAt) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
