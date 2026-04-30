import { useState } from 'react';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import {
  acceptGroupOrder,
  declineGroupOrder,
  assignCourierToGroupOrder,
  acceptGroupOrderInWarehouse,
  cancelGroupOrderByAdmin,
  setGroupOrderPickupDate,
} from '../../api/adminGroupOrders';
import { sendOrderToCity, assignCourierToOrder, cancelOrderByAdmin, setCourierSalary, setCompanyServicePrice } from '../../api/orders';
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
  const [showPickupDate, setShowPickupDate] = useState(false);
  const [pickupDateValue, setPickupDateValue] = useState('');

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

  async function handleSetPickupDate() {
    if (!pickupDateValue) return;
    await run(
      () => setGroupOrderPickupDate(token, groupOrder.id, new Date(pickupDateValue).toISOString()),
      'Pickup date set.'
    );
    setShowPickupDate(false);
    setPickupDateValue('');
  }

  const { status } = groupOrder;
  const isCancelledOrDone =
    status === 'CancelledByAdmin' || status === 'CancelledBySender' || status === 'OrderNotAccepted';

  return (
    <div className="go-actions" onClick={e => e.stopPropagation()}>

      {/* Step 1: Accept or Decline pending order */}
      {status === 'Pending' && (
        <>
          <button className="go-action-btn go-action-btn--accept" disabled={busy}
            onClick={() => run(() => acceptGroupOrder(token, groupOrder.id), 'Group order accepted.')}>
            ✓ Accept
          </button>
          <button className="go-action-btn go-action-btn--decline" disabled={busy}
            onClick={() => run(() => declineGroupOrder(token, groupOrder.id), 'Group order declined.')}>
            ✗ Decline
          </button>
        </>
      )}

      {/* Step 1b: Set pickup date (after accepting) */}
      {status === 'AcceptedGroupOrder' && !showCourierPicker && !showPickupDate && (
        <>
          <button className="go-action-btn go-action-btn--assign" disabled={busy}
            onClick={() => setShowCourierPicker(true)}>
            Assign Courier
          </button>
          <button className="go-action-btn go-action-btn--ghost" disabled={busy}
            onClick={() => setShowPickupDate(true)}>
            📅 Set Pickup Date
          </button>
        </>
      )}

      {/* Courier picker */}
      {status === 'AcceptedGroupOrder' && showCourierPicker && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <select className="go-select go-select--inline" value={selectedCourierId}
            onChange={e => setSelectedCourierId(e.target.value)}>
            <option value="">Choose courier…</option>
            {couriers.map(c => (
              <option key={c.courierId} value={c.courierId}>
                {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
              </option>
            ))}
          </select>
          <button className="go-action-btn go-action-btn--accept"
            disabled={!selectedCourierId || busy} onClick={handleAssignGroupCourier}>
            Confirm
          </button>
          <button className="go-action-btn go-action-btn--ghost"
            onClick={() => { setShowCourierPicker(false); setSelectedCourierId(''); }}>
            Cancel
          </button>
        </div>
      )}

      {/* Pickup date picker */}
      {showPickupDate && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <input
            type="date"
            className="go-select go-select--inline"
            value={pickupDateValue}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setPickupDateValue(e.target.value)}
          />
          <button className="go-action-btn go-action-btn--accept"
            disabled={!pickupDateValue || busy} onClick={handleSetPickupDate}>
            Save Date
          </button>
          <button className="go-action-btn go-action-btn--ghost"
            onClick={() => { setShowPickupDate(false); setPickupDateValue(''); }}>
            Cancel
          </button>
        </div>
      )}

      {/* Step 6: Accept batch in warehouse */}
      {status === 'DeliveredToWarehouse' && (
        <button className="go-action-btn go-action-btn--warehouse" disabled={busy}
          onClick={() => run(() => acceptGroupOrderInWarehouse(token, groupOrder.id), 'Accepted in warehouse.')}>
          ✓ Accept in Warehouse
        </button>
      )}

      {status === 'AdminAcceptedOrderInWareHouse' && (
        <span className="go-action-hint">↓ Assign each package below</span>
      )}

      {/* Cancel by Admin — always visible unless already terminal */}
      {!isCancelledOrDone && (
        <button
          className="go-action-btn go-action-btn--cancel-admin"
          disabled={busy}
          title="Cancel this entire group order (admin override)"
          onClick={() => {
            if (!window.confirm('Cancel this entire group order and all its packages?')) return;
            run(() => cancelGroupOrderByAdmin(token, groupOrder.id), 'Group order cancelled by admin.');
          }}
        >
          ✕ Cancel (Admin)
        </button>
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
  const [showSalary, setShowSalary] = useState(false);
  const [salaryValue, setSalaryValue] = useState(order.courierSalary?.toString() ?? '');
  const [showServicePrice, setShowServicePrice] = useState(false);
  const [servicePriceValue, setServicePriceValue] = useState(order.companyServicePrice?.toString() ?? '');

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
  const isTerminal = status === 'DeliveredToRecipient' || status === 'CancelledByAdmin' || status === 'CancelledBySender';

  return (
    <div className="go-actions" onClick={e => e.stopPropagation()}>
      {/* Step 7: non-Tbilisi → Send to City */}
      {status === 'AdminAcceptedOrderInWareHouse' && !isTbilisi && (
        <button className="go-action-btn go-action-btn--city" disabled={busy}
          onClick={() => run(() => sendOrderToCity(token, order.id), `Sent to ${recipientCity}.`)}>
          Send to {recipientCity}
        </button>
      )}

      {/* Step 8/9: Assign last-mile courier */}
      {((status === 'AdminAcceptedOrderInWareHouse' && isTbilisi) ||
        status === 'OrderIsOnItsWayToRecipientsCity') && !showPicker && (
        <button className="go-action-btn go-action-btn--assign" disabled={busy}
          onClick={() => setShowPicker(true)}>
          Assign Courier
        </button>
      )}

      {((status === 'AdminAcceptedOrderInWareHouse' && isTbilisi) ||
        status === 'OrderIsOnItsWayToRecipientsCity') && showPicker && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <select className="go-select go-select--inline" value={selectedCourierId}
            onChange={e => setSelectedCourierId(e.target.value)}>
            <option value="">Choose courier…</option>
            {couriers.map(c => (
              <option key={c.courierId} value={c.courierId}>
                {c.fullName} — {c.assignedCity}
              </option>
            ))}
          </select>
          <button className="go-action-btn go-action-btn--accept"
            disabled={!selectedCourierId || busy}
            onClick={async () => {
              await run(
                () => assignCourierToOrder(token, order.id, selectedCourierId),
                'Courier assigned for delivery.'
              );
              setShowPicker(false);
              setSelectedCourierId('');
            }}>
            Confirm
          </button>
          <button className="go-action-btn go-action-btn--ghost"
            onClick={() => { setShowPicker(false); setSelectedCourierId(''); }}>
            Cancel
          </button>
        </div>
      )}

      {/* Courier Salary input (admin sets any time) */}
      {!showSalary && (
        <button className="go-action-btn go-action-btn--ghost" disabled={busy}
          title="Set courier salary for this package"
          onClick={() => setShowSalary(true)}>
          💰 {order.courierSalary != null ? `₾${order.courierSalary}` : 'Set Salary'}
        </button>
      )}
      {showSalary && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <input
            type="number"
            min="0"
            step="0.01"
            className="go-select go-select--inline"
            placeholder="0.00"
            value={salaryValue}
            onChange={e => setSalaryValue(e.target.value)}
          />
          <button className="go-action-btn go-action-btn--accept"
            disabled={busy || salaryValue === ''}
            onClick={async () => {
              const amount = parseFloat(salaryValue);
              if (isNaN(amount) || amount < 0) return;
              await run(
                () => setCourierSalary(token, order.id, amount),
                `Salary set to ₾${amount.toFixed(2)}.`
              );
              setShowSalary(false);
            }}>
            Save
          </button>
          <button className="go-action-btn go-action-btn--ghost"
            onClick={() => setShowSalary(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Company Service Price input */}
      {!showServicePrice && (
        <button className="go-action-btn go-action-btn--ghost" disabled={busy}
          title="Set company service price for this package"
          onClick={() => setShowServicePrice(true)}>
          🏷 {order.companyServicePrice != null && order.companyServicePrice > 0 ? `₾${order.companyServicePrice}` : 'Set Price'}
        </button>
      )}
      {showServicePrice && (
        <div className="go-courier-picker" onClick={e => e.stopPropagation()}>
          <input
            type="number"
            min="0"
            step="0.01"
            className="go-select go-select--inline"
            placeholder="0.00"
            value={servicePriceValue}
            onChange={e => setServicePriceValue(e.target.value)}
          />
          <button className="go-action-btn go-action-btn--accept"
            disabled={busy || servicePriceValue === ''}
            onClick={async () => {
              const amount = parseFloat(servicePriceValue);
              if (isNaN(amount) || amount < 0) return;
              await run(
                () => setCompanyServicePrice(token, order.id, amount),
                `Service price set to ₾${amount.toFixed(2)}.`
              );
              setShowServicePrice(false);
            }}>
            Save
          </button>
          <button className="go-action-btn go-action-btn--ghost"
            onClick={() => setShowServicePrice(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Cancel single order by Admin — always available unless terminal */}
      {!isTerminal && (
        <button
          className="go-action-btn go-action-btn--cancel-admin"
          disabled={busy}
          title="Cancel this package (admin override)"
          onClick={() => {
            if (!window.confirm('Cancel this package?')) return;
            run(() => cancelOrderByAdmin(token, order.id), 'Order cancelled by admin.');
          }}
        >
          ✕ Cancel
        </button>
      )}
    </div>
  );
}

// ── Status colour map (all statuses including new ones) ───────────────────────
export const STATUS_COLORS: Record<string, [string, string]> = {
  Pending:                         ['rgba(160,120,0,0.12)',  '#c4870f'],
  AcceptedGroupOrder:              ['rgba(59,130,246,0.12)', '#3b82f6'],
  AcceptedOrder:                   ['rgba(59,130,246,0.12)', '#3b82f6'],
  CourierAssignedToPickUp:         ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierOnTheWayToPickUp:         ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierDeliveringToWarehouse:    ['rgba(249,115,22,0.12)', '#f97316'],
  DeliveredToWarehouse:            ['rgba(16,185,129,0.12)', '#10b981'],
  AdminAcceptedOrderInWareHouse:   ['rgba(16,185,129,0.12)', '#10b981'],
  OrderIsOnItsWayToRecipientsCity: ['rgba(59,130,246,0.12)', '#3b82f6'],
  CourierAssignedToDeliver:        ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierRecievedOrderToDeliver:   ['rgba(249,115,22,0.12)', '#f97316'],
  DeliveredToRecipient:            ['rgba(16,185,129,0.12)', '#10b981'],
  CancelledBySender:               ['rgba(239,68,68,0.12)',  '#ef4444'],
  OrderNotAccepted:                ['rgba(239,68,68,0.12)',  '#ef4444'],
  CancelledByAdmin:                ['rgba(239,68,68,0.12)',  '#ef4444'],
};
