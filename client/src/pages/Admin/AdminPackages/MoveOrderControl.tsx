// Move a single package to a different same-customer batch (copied from AdminDashboard.tsx).
import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import { moveOrderToGroup } from '../../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../../api/adminGroupOrders';

export function MoveOrderControl({ orderId, destinations, token, onMoved, onError }: {
  orderId: string; destinations: AdminGroupOrder[]; token: string; onMoved: () => void; onError: (msg: string) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const handle = async (targetId: string) => {
    if (!targetId) return;
    setBusy(true);
    try { await moveOrderToGroup(token, orderId, targetId); onMoved(); }
    catch (e) { onError(e instanceof Error ? e.message : t.pickupMoveError); }
    finally { setBusy(false); }
  };
  return (
    <select className="go-select go-select--inline" style={{ minWidth: 120 }} value="" disabled={busy} onChange={e => void handle(e.target.value)} title={t.pickupMoveTo}>
      <option value="">{busy ? t.pickupMoving : t.pickupMoveTo}</option>
      {destinations.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {b.numberOfPackages}</option>)}
    </select>
  );
}
