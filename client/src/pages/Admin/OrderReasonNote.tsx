// One-line "why" under an order's status badge on the admin last-mile rows (Packages and
// Delivery pages): the postpone reason while the order is postponed, and the cancellation
// reason once it was cancelled / failed. The backend clears the postpone fields on retry,
// cancel and return-to-sender, so a non-null postponeReason always means "postponed now".
import { useLanguage } from '../../contexts/useLanguage';
import { NON_BILLABLE_CANCEL_REASONS } from '../../api/orders';

export function OrderReasonNote({ postponeReason, postponeComment, cancellationReason, cancellationComment }: {
  postponeReason?: string | null;
  postponeComment?: string | null;
  cancellationReason?: string | null;
  cancellationComment?: string | null;
}) {
  const { t } = useLanguage();
  return (
    <>
      {postponeReason && (
        <div style={{ fontSize: '0.7rem', color: '#f97316', marginTop: 2 }}>
          {t.cdPostponeReasons[postponeReason] ?? postponeReason}
          {postponeComment && ` — ${postponeComment}`}
        </div>
      )}
      {cancellationReason && (
        <div style={{ fontSize: '0.7rem', marginTop: 2, color: NON_BILLABLE_CANCEL_REASONS.has(cancellationReason) ? '#059669' : '#dc2626' }}>
          {t.cdCancelReasons[cancellationReason] ?? cancellationReason}
          {cancellationComment && ` — ${cancellationComment}`}
        </div>
      )}
    </>
  );
}
