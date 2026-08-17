// Small status-badge components shared across the Packages page's list, accordion, and modals.
import { useLanguage } from '../../../contexts/useLanguage';
import { getStatusMeta } from '../../../utils/statusMeta';

const STATUS_CLASS_MAP: Record<string, string> = {
  Pending: 'pending', AcceptedGroupOrder: 'accepted', AcceptedOrder: 'accepted',
  CourierAssignedToPickUp: 'assigned',
  CourierDeliveringToWarehouse: 'delivering', DeliveredToWarehouse: 'warehouse',
  AdminAcceptedOrderInWareHouse: 'warehouse', OrderIsOnItsWayToRecipientsCity: 'onway',
  CourierAssignedToDeliver: 'assigned', CourierDeliveringTheOrderToRecipient: 'delivering',
  OrderIsBeingDeliveredToRecipient: 'delivering', DeliveredToRecipient: 'delivered',
  CancelledBySender: 'cancelled', CancelledByAdmin: 'cancelled', OrderNotAccepted: 'declined',
};

export function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  return (
    <span
      className={`status-badge status-badge--${STATUS_CLASS_MAP[status] ?? 'pending'}`}
      title={meta.description}
    >
      {meta.short}
    </span>
  );
}

// Distinguishes Send/Return/Exchange on a package row — Return orders are otherwise visually
// identical to a normal Send (same table, same status pill), which confused admins into
// treating them as ordinary deliveries.
export function OrderTypeBadge({ orderType }: { orderType: string }) {
  const { t } = useLanguage();
  const style = orderType === 'Return'
    ? { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }
    : orderType === 'Exchange'
    ? { background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }
    : { background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)', border: '1px solid var(--color-border)' };
  const label = orderType === 'Return' ? t.aopOrderTypeReturn : orderType === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend;
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.62rem', fontWeight: 700, padding: '1px 7px', borderRadius: 100,
      letterSpacing: '0.03em', textTransform: 'uppercase', whiteSpace: 'nowrap', ...style,
    }}>
      {label}
    </span>
  );
}
