import type { CreateGroupOrderResponse } from '../../types/groupOrder';
import { useLanguage } from '../../contexts/useLanguage';

interface SuccessViewProps {
  result: CreateGroupOrderResponse;
  onNewOrder: () => void;
}

export function SuccessView({ result, onNewOrder }: SuccessViewProps) {
  const { t } = useLanguage();

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text).catch(() => null);
  };

  return (
    <div className="success-view">
      <div className="success-view__hero">
        <div className="success-view__icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path
              d="M6 16L13 23L26 9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="success-view__title">{t.cgoSuccessTitle}</h2>
        <p className="success-view__subtitle">{t.cgoSuccessSubtitle}</p>
        <div className="success-view__order-id">
          {t.cgoSuccessOrderId}{' '}
          <button
            type="button"
            className="success-view__copy-btn"
            onClick={() => copyToClipboard(result.groupOrderId)}
            title="Click to copy"
          >
            {result.groupOrderId}
          </button>
        </div>
      </div>

      <div className="tracking-list">
        <h3 className="tracking-list__heading">
          {t.cgoSuccessTrackingHeading(result.orders.length)}
        </h3>
        <div className="tracking-list__items">
          {result.orders.map(order => (
            <div key={order.orderId} className="tracking-item">
              <div className="tracking-item__recipient">
                {order.recipientName}
              </div>
              <button
                type="button"
                className="tracking-item__tn"
                onClick={() => copyToClipboard(order.trackingNumber)}
                title="Click to copy tracking number"
              >
                <span>{order.trackingNumber}</span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect
                    x="5"
                    y="1"
                    width="8"
                    height="8"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                  <path
                    d="M9 9v2.5a1.5 1.5 0 01-1.5 1.5H1.5A1.5 1.5 0 010 11.5V5a1.5 1.5 0 011.5-1.5H4"
                    stroke="currentColor"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="btn btn--ghost success-view__new" onClick={onNewOrder}>
        {t.cgoSuccessNewOrder}
      </button>
    </div>
  );
}
