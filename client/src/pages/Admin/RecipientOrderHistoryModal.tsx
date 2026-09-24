import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchRecipientOrderHistory } from '../../api/recipients';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import '../../components/ui/Modal.css';

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  const [bg, color] = STATUS_COLORS[status] ?? ['rgba(107,114,128,0.12)', '#6b7280'];
  return (
    <span title={meta.description} style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.72rem', fontWeight: 700, background: bg, color, whiteSpace: 'nowrap',
    }}>
      {meta.short}
    </span>
  );
}

function OrderTypeLabel({ orderType }: { orderType: string }) {
  const { t } = useLanguage();
  return <>{orderType === 'Return' ? t.aopOrderTypeReturn : orderType === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend}</>;
}

/** Drill-down from a Recipients directory row: every order ever sent to that recipient
 *  phone, across every customer. `phone` null = closed. */
export function RecipientOrderHistoryModal({
  token, phone, displayName, onClose,
}: {
  token: string;
  phone: string | null;
  displayName: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  const query = useQuery({
    queryKey: ['admin', 'recipients', 'history', phone] as const,
    queryFn: () => fetchRecipientOrderHistory(token, phone!),
    enabled: phone !== null,
  });

  if (phone === null) return null;
  const orders = query.data ?? [];

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.rcpHistoryTitle(displayName)}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          {query.isPending && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
              <div className="go-spinner" style={{ margin: '0 auto 8px' }} />{t.loading}
            </div>
          )}
          {query.isError && (
            <p className="ui-modal__message" style={{ color: 'var(--color-error)' }}>{t.rcpHistoryLoadFail}</p>
          )}
          {query.isSuccess && orders.length === 0 && (
            <p className="ui-modal__message">{t.rcpHistoryNone}</p>
          )}
          {query.isSuccess && orders.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="go-orders-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th>{t.rcpHistoryThTracking}</th>
                    <th>{t.rcpHistoryThType}</th>
                    <th>{t.rcpHistoryThStatus}</th>
                    <th>{t.rcpHistoryThSender}</th>
                    <th>{t.rcpHistoryThPlaced}</th>
                    <th>{t.rcpHistoryThCompleted}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id}>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td><OrderTypeLabel orderType={o.orderType} /></td>
                      <td><StatusBadge status={o.status} /></td>
                      <td style={{ fontSize: '0.82rem' }}>{o.senderDisplayName || '—'}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(o.createdAt) || '—'}</td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(o.completedAt) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
