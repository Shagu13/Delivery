import { useState } from 'react';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import {
  acceptGroupOrder,
  declineGroupOrder,
  assignCourierToGroupOrder,
  acceptGroupOrderInWarehouse,
} from '../../api/adminGroupOrders';
import { sendOrderToCity, assignCourierToOrder } from '../../api/orders';
import type { Courier } from '../../api/couriers';

interface Props {
  groupOrder: AdminGroupOrder;
  couriers: Courier[];
  token: string;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => void;
}

export function AdminGroupOrderActions({ groupOrder, couriers, token, onSuccess, onError, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [showCourierPicker, setShowCourierPicker] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState('');

  async function run(fn: () => Promise<void>, successMsg: string) {
    setBusy(true);
    try {
      await fn();
      onSuccess(successMsg);
      onRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignGroupCourier() {
    if (!selectedCourierId) return;
    await run(
      () => assignCourierToGroupOrder(token, groupOrder.id, selectedCourierId),
      'Courier assigned for pickup.'
    );
    setShowCourierPicker(false);
    setSelectedCourierId('');
  }

  const { status } = groupOrder;

  return (
    <div className="go-actions" onClick={e => e.stopPropagation()}>

      {/* Step 1: Accept or Decline pending order */}
      {status === 'Pending' && (
        <>
          <button
            className="go-action-btn go-action-btn--accept"
            disabled={busy}
            onClick={() => run(() => acceptGroupOrder(token, groupOrder.id), 'Group order accepted.')}
          >
            ✓ Accept
          </button>
          <button
            className="go-action-btn go-action-btn--decline"
            disabled={busy}
            onClick={() => run(() => declineGroupOrder(token, groupOrder.id), 'Group order declined.')}
          >
            ✗ Decline
          </button>
        </>
      )}

      {/* Step 2: Assign pickup courier */}
      {status === 'AcceptedGroupOrder' && !showCourierPicker && (
        <button
          className="go-action-btn go-action-btn--assign"
          disabled={busy}
          onClick={() => setShowCourierPicker(true)}
        >
          Assign Courier
        </button>
      )}

      {status === 'AcceptedGroupOrder' && showCourierPicker && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <select
            className="go-select go-select--inline"
            value={selectedCourierId}
            onChange={e => setSelectedCourierId(e.target.value)}
          >
            <option value="">Choose courier…</option>
            {couriers.map(c => (
              <option key={c.courierId} value={c.courierId}>
                {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
              </option>
            ))}
          </select>
          <button
            className="go-action-btn go-action-btn--accept"
            disabled={!selectedCourierId || busy}
            onClick={handleAssignGroupCourier}
          >
            Confirm
          </button>
          <button
            className="go-action-btn go-action-btn--ghost"
            onClick={() => { setShowCourierPicker(false); setSelectedCourierId(''); }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 6: Accept batch in warehouse */}
      {status === 'DeliveredToWarehouse' && (
        <button
          className="go-action-btn go-action-btn--warehouse"
          disabled={busy}
          onClick={() => run(() => acceptGroupOrderInWarehouse(token, groupOrder.id), 'Accepted in warehouse.')}
        >
          ✓ Accept in Warehouse
        </button>
      )}

      {status === 'AdminAcceptedOrderInWareHouse' && (
        <span className="go-action-hint">↓ Assign each package below</span>
      )}
    </div>
  );
}

// ── Per-order action cell ─────────────────────────────────────────────────────

interface OrderActionProps {
  order: AdminGroupOrder['orders'][0];
  couriers: Courier[];
  token: string;
  onSuccess: (msg: string) => void;
  onError:   (msg: string) => void;
  onRefresh: () => void;
}

export function AdminOrderRowActions({ order, couriers, token, onSuccess, onError, onRefresh }: OrderActionProps) {
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState('');

  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    try {
      await fn();
      onSuccess(msg);
      onRefresh();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  const { status, recipientCity } = order;
  const isTbilisi = recipientCity === 'თბილისი';

  // Step 7: non-Tbilisi → Send to City
  if (status === 'AdminAcceptedOrderInWareHouse' && !isTbilisi) {
    return (
      <button
        className="go-action-btn go-action-btn--city"
        disabled={busy}
        onClick={() => run(() => sendOrderToCity(token, order.id), `Sent to ${recipientCity}.`)}
      >
        Send to {recipientCity}
      </button>
    );
  }

  // Step 9 (Tbilisi) or after city transit: assign last-mile courier
  const canAssign =
    (status === 'AdminAcceptedOrderInWareHouse' && isTbilisi) ||
    status === 'OrderIsOnItsWayToRecipientsCity';

  if (canAssign && !showPicker) {
    return (
      <button
        className="go-action-btn go-action-btn--assign"
        disabled={busy}
        onClick={() => setShowPicker(true)}
      >
        Assign Courier
      </button>
    );
  }

  if (canAssign && showPicker) {
    return (
      <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
        <select
          className="go-select go-select--inline"
          value={selectedCourierId}
          onChange={e => setSelectedCourierId(e.target.value)}
        >
          <option value="">Choose courier…</option>
          {couriers.map(c => (
            <option key={c.courierId} value={c.courierId}>
              {c.fullName} — {c.assignedCity}
            </option>
          ))}
        </select>
        <button
          className="go-action-btn go-action-btn--accept"
          disabled={!selectedCourierId || busy}
          onClick={async () => {
            await run(
              () => assignCourierToOrder(token, order.id, selectedCourierId),
              'Courier assigned for delivery.'
            );
            setShowPicker(false);
            setSelectedCourierId('');
          }}
        >
          Confirm
        </button>
        <button
          className="go-action-btn go-action-btn--ghost"
          onClick={() => { setShowPicker(false); setSelectedCourierId(''); }}
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
