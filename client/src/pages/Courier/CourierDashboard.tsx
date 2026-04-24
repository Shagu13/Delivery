import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import {
  fetchMyPickups,
  markPickingUp,
  markPickedUp,
  markDeliveredToWarehouse,
} from '../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../api/adminGroupOrders';
import {
  fetchMyDeliveries,
  markOrderReceived,
  markOrderDelivering,
  markOrderDelivered,
} from '../../api/orders';
import type { CourierOrder } from '../../api/orders';
import '../../styles/dashboard.css';

type CourierView = 'pickups' | 'deliveries';

export function CourierDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<CourierView>('pickups');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };
  const initials = user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'C';

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div className="sidebar__logo">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Delivery
        </div>
        <span className="sidebar__role-badge">Courier</span>

        <div className="sidebar__divider" />
        <p className="sidebar__section-label">My Work</p>

        <nav className="sidebar__nav">
          <button
            className={`sidebar__link ${activeView === 'pickups' ? 'sidebar__link--active' : ''}`}
            onClick={() => setActiveView('pickups')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Pickups
          </button>
          <button
            className={`sidebar__link ${activeView === 'deliveries' ? 'sidebar__link--active' : ''}`}
            onClick={() => setActiveView('deliveries')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Deliveries
          </button>
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initials}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">{user?.firstName} {user?.lastName}</div>
              <div className="sidebar__user-handle">@{user?.username}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleSignOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      <div className="dashboard__body">
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {activeView === 'pickups' ? 'Assigned Pickups' : 'My Deliveries'}
          </span>
        </div>
        <main className="dashboard__content">
          {activeView === 'pickups' && (
            <CourierPickups onToast={showToast} />
          )}
          {activeView === 'deliveries' && (
            <CourierDeliveries onToast={showToast} />
          )}
        </main>
      </div>

      {toast && (
        <div className={`toast ${toast.type === 'err' ? 'toast--error' : ''}`} role="status">
          {toast.msg}
        </div>
      )}

      <style>{`
        .courier-card {
          background: var(--color-bg-2, var(--color-bg));
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          margin-bottom: 16px;
          overflow: hidden;
        }
        .courier-card__header {
          padding: 16px 20px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .courier-card__biz {
          font-weight: 700;
          font-size: 1rem;
          color: var(--color-text);
        }
        .courier-card__meta {
          font-size: 0.8rem;
          color: var(--color-text-subtle);
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 4px;
        }
        .courier-card__orders {
          border-top: 1px solid var(--color-border);
          padding: 8px 20px 12px;
        }
        .courier-card__order-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 0;
          border-bottom: 1px solid var(--color-border);
          font-size: 0.85rem;
        }
        .courier-card__order-item:last-child { border-bottom: none; }
        .courier-card__actions {
          padding: 12px 20px;
          border-top: 1px solid var(--color-border);
          display: flex;
          gap: 10px;
          background: var(--color-bg-3);
        }
        .c-btn {
          border: none;
          border-radius: var(--radius-sm);
          font-size: 0.82rem;
          font-weight: 600;
          padding: 8px 18px;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .c-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .c-btn--primary {
          background: var(--color-accent);
          color: #fff;
        }
        .c-btn--secondary {
          background: var(--color-bg-3);
          border: 1px solid var(--color-border);
          color: var(--color-text);
        }
        .c-btn--success {
          background: #10b981;
          color: #fff;
        }
        .status-pill {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border-radius: 100px;
          padding: 2px 9px;
          white-space: nowrap;
        }
        .tn { font-family: 'Courier New', monospace; font-size: 0.78rem; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: 4px; padding: 1px 6px; }
        .toast--error { background: #ef4444 !important; }
      `}</style>
    </div>
  );
}

// ── Pickup list ───────────────────────────────────────────────────────────────
function CourierPickups({ onToast }: { onToast: (msg: string, type?: 'ok' | 'err') => void }) {
  const [groups, setGroups] = useState<AdminGroupOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null); // groupOrderId being acted on

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await fetchMyPickups());
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Failed to load.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, fn: () => Promise<void>, msg: string) {
    setBusy(id);
    try {
      await fn();
      onToast(msg);
      await load();
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Action failed.', 'err');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>Loading…</div>;
  if (groups.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
        No active pickups assigned to you.
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {groups.map(go => {
        const isBusy = busy === go.id;
        return (
          <div className="courier-card" key={go.id}>
            <div className="courier-card__header">
              <div className="courier-card__biz">{go.senderBusinessName}</div>
              <div className="courier-card__meta">
                <span>📞 {go.senderPhone}</span>
                <span>📍 {go.pickUpAddress}, {go.pickUpDistrict}, {go.pickUpCity}</span>
                {go.note && <span>📝 {go.note}</span>}
                <StatusPill status={go.status} />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                {go.senderFirstName} {go.senderLastName} · {go.numberOfPackages} package{go.numberOfPackages !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="courier-card__orders">
              {go.orders.map(o => (
                <div className="courier-card__order-item" key={o.id}>
                  <span className="tn">{o.trackingNumber}</span>
                  <span style={{ flex: 1 }}>{o.recipientFirstName} {o.recipientLastName}</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                    {o.recipientCity}, {o.recipientDistrict}
                  </span>
                </div>
              ))}
            </div>

            <div className="courier-card__actions">
              {/* Step 3: CourierAssignedToPickUp → picking up */}
              {go.status === 'CourierAssignedToPickUp' && (
                <button
                  className="c-btn c-btn--primary"
                  disabled={isBusy}
                  onClick={() => act(go.id, () => markPickingUp(go.id), 'Marked as picking up.')}
                >
                  Picking Up
                </button>
              )}

              {/* Step 4: CourierOnTheWayToPickUp → picked up */}
              {go.status === 'CourierOnTheWayToPickUp' && (
                <button
                  className="c-btn c-btn--primary"
                  disabled={isBusy}
                  onClick={() => act(go.id, () => markPickedUp(go.id), 'Marked as picked up.')}
                >
                  Picked Up
                </button>
              )}

              {/* Step 5: CourierDeliveringToWarehouse → delivered to warehouse */}
              {go.status === 'CourierDeliveringToWarehouse' && (
                <button
                  className="c-btn c-btn--success"
                  disabled={isBusy}
                  onClick={() => act(go.id, () => markDeliveredToWarehouse(go.id), 'Delivered to warehouse.')}
                >
                  Delivered to Warehouse
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Delivery list ─────────────────────────────────────────────────────────────
function CourierDeliveries({ onToast }: { onToast: (msg: string, type?: 'ok' | 'err') => void }) {
  const [orders, setOrders] = useState<CourierOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await fetchMyDeliveries());
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Failed to load.', 'err');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => { void load(); }, [load]);

  async function act(id: string, fn: () => Promise<void>, msg: string) {
    setBusy(id);
    try {
      await fn();
      onToast(msg);
      await load();
    } catch (e: unknown) {
      onToast(e instanceof Error ? e.message : 'Action failed.', 'err');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>Loading…</div>;
  if (orders.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
        No active deliveries assigned to you.
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      {orders.map(order => {
        const isBusy = busy === order.id;
        return (
          <div className="courier-card" key={order.id}>
            <div className="courier-card__header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="tn">{order.trackingNumber}</span>
                <StatusPill status={order.status} />
              </div>
              <div className="courier-card__meta" style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 600 }}>{order.recipientFirstName} {order.recipientLastName}</span>
                <span>📞 {order.recipientPhone}</span>
                <span>📍 {order.recipientAddress}, {order.recipientDistrict}, {order.recipientCity}</span>
              </div>
              {order.description && (
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', marginTop: 4 }}>
                  📋 {order.description}
                </div>
              )}
            </div>

            <div className="courier-card__actions">
              {/* Step 10/8: CourierAssignedToDeliver → received */}
              {order.status === 'CourierAssignedToDeliver' && (
                <button
                  className="c-btn c-btn--secondary"
                  disabled={isBusy}
                  onClick={() => act(order.id, () => markOrderReceived(order.id), 'Order received from warehouse.')}
                >
                  Received Order
                </button>
              )}

              {/* Step 11: CourierRecievedOrderToDeliver → delivering */}
              {order.status === 'CourierRecievedOrderToDeliver' && (
                <button
                  className="c-btn c-btn--primary"
                  disabled={isBusy}
                  onClick={() => act(order.id, () => markOrderDelivering(order.id), 'Marked as delivering.')}
                >
                  Delivering
                </button>
              )}

              {/* Step 12: OrderIsBeingDeliveredToRecipient → delivered */}
              {order.status === 'OrderIsBeingDeliveredToRecipient' && (
                <button
                  className="c-btn c-btn--success"
                  disabled={isBusy}
                  onClick={() => act(order.id, () => markOrderDelivered(order.id), 'Order delivered to recipient.')}
                >
                  Delivered ✓
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── StatusPill ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, [string, string]> = {
  Pending:                          ['rgba(160,120,0,0.12)',  '#c4870f'],
  AcceptedGroupOrder:               ['rgba(59,130,246,0.12)', '#3b82f6'],
  AcceptedOrder:                    ['rgba(59,130,246,0.12)', '#3b82f6'],
  CourierAssignedToPickUp:          ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierOnTheWayToPickUp:          ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierDeliveringToWarehouse:     ['rgba(249,115,22,0.12)', '#f97316'],
  DeliveredToWarehouse:             ['rgba(16,185,129,0.12)', '#10b981'],
  AdminAcceptedOrderInWareHouse:    ['rgba(16,185,129,0.12)', '#10b981'],
  OrderIsOnItsWayToRecipientsCity:  ['rgba(59,130,246,0.12)', '#3b82f6'],
  CourierAssignedToDeliver:         ['rgba(139,92,246,0.12)', '#8b5cf6'],
  CourierRecievedOrderToDeliver:    ['rgba(249,115,22,0.12)', '#f97316'],
  OrderIsBeingDeliveredToRecipient: ['rgba(249,115,22,0.12)', '#f97316'],
  DeliveredToRecipient:             ['rgba(16,185,129,0.12)', '#10b981'],
  CancelledBySender:                ['rgba(239,68,68,0.12)',  '#ef4444'],
  OrderNotAccepted:                 ['rgba(239,68,68,0.12)',  '#ef4444'],
};

function StatusPill({ status }: { status: string }) {
  const [bg, color] = STATUS_COLORS[status] ?? ['rgba(160,120,0,0.12)', '#c4870f'];
  const label = status.replace(/([A-Z])/g, ' $1').trim();
  return (
    <span className="status-pill" style={{ background: bg, color }}>
      {label}
    </span>
  );
}
