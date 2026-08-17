// Attach a customer's unattached same-day packages onto a batch (copied from AdminDashboard.tsx).
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../../contexts/useLanguage';
import { recipientDisplayName } from '../../../utils/recipientName';
import { toDateKey } from '../../../utils/georgianTime';
import { fetchCustomerUnattached, attachOrdersToGroup } from '../../../api/adminGroupOrders';
import type { AdminGroupOrder, PickupDayCustomer } from '../../../api/adminGroupOrders';
import { pickupCityDisplay, pickupDistrictDisplay } from './shared';

export function GroupingModal({ customer, date, batches, token, onClose, onGrouped }: {
  customer: PickupDayCustomer; date: Date; batches: AdminGroupOrder[]; token: string; onClose: () => void; onGrouped: (count: number) => void;
}) {
  const { t, lang } = useLanguage();
  const dateKey = toDateKey(date);

  const unattachedQuery = useQuery({
    queryKey: ['admin', 'packages', 'customerUnattached', customer.customerId, dateKey] as const,
    queryFn: () => fetchCustomerUnattached(token, customer.customerId, dateKey),
  });
  const orders = unattachedQuery.data ?? [];
  const loading = unattachedQuery.isPending;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [targetBatchId, setTargetBatchId] = useState(batches[0]?.id ?? '');

  // Default to "everything selected" once the unattached list resolves. Keyed on the query's
  // own data reference, so this only re-runs when a fetch actually lands new data — not on
  // every render — mirroring the original effect's "run once per (customer, date)" behavior.
  useEffect(() => {
    if (unattachedQuery.data) setSelected(new Set(unattachedQuery.data.map(o => o.id)));
  }, [unattachedQuery.data]);

  useEffect(() => {
    if (unattachedQuery.isError) setError(t.pickupGroupError);
  }, [unattachedQuery.isError, t.pickupGroupError]);

  const toggle = (id: string) => setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const allSelected = orders.length > 0 && selected.size === orders.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(orders.map(o => o.id)));

  const handleGroup = async () => {
    if (selected.size === 0) return;
    setBusy(true); setError(null);
    try { await attachOrdersToGroup(token, customer.customerId, dateKey, [...selected], targetBatchId || undefined); onGrouped(selected.size); }
    catch (e) { setError(e instanceof Error ? e.message : t.pickupGroupError); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupModalTitle(customer.businessName)}</h3>
            <p className="pickup-modal__subtitle">{t.pickupModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>
        <div className="pickup-modal__body">
          {loading ? (
            <div className="go-loading"><div className="go-spinner" /></div>
          ) : orders.length === 0 ? (
            <div className="pickup-summary__empty" style={{ padding: 24 }}>{t.pickupModalEmpty}</div>
          ) : (
            <>
              {batches.length > 0 && (
                <label className="pickup-modal__target">
                  <span>{t.pickupGroupTarget}</span>
                  <select className="go-select" value={targetBatchId} onChange={e => setTargetBatchId(e.target.value)}>
                    {batches.map(b => <option key={b.id} value={b.id}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {t.goPkgs(b.numberOfPackages)}</option>)}
                    <option value="">{t.pickupGroupNewBatch}</option>
                  </select>
                </label>
              )}
              <label className="pickup-modal__selectall">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                {t.pickupSelectAll}
                <span className="pickup-modal__selcount">{t.pickupModalSelected(selected.size)}</span>
              </label>
              <table className="go-orders-table" style={{ minWidth: 0 }}>
                <thead><tr><th style={{ width: 34 }} /><th>{t.goThTracking}</th><th>{t.goThRecipient}</th><th>{t.goThCityDistrict}</th><th>{t.goThCollect}</th></tr></thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => toggle(o.id)}>
                      <td><input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} onClick={e => e.stopPropagation()} /></td>
                      <td><span className="tn-badge">{o.trackingNumber}</span></td>
                      <td>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</td>
                      <td>{pickupCityDisplay(o, lang)}, {pickupDistrictDisplay(o, lang)}</td>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{o.amountToCollectForPackage != null ? `₾${o.amountToCollectForPackage.toFixed(2)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {error && <div className="pickup-modal__error">{error}</div>}
        </div>
        <div className="pickup-modal__footer">
          <button className="go-action-btn go-action-btn--ghost" onClick={onClose} disabled={busy}>{t.cancel}</button>
          <button className="go-action-btn go-action-btn--assign" onClick={handleGroup} disabled={busy || selected.size === 0}>{busy ? t.pickupModalGrouping : t.pickupModalGroup}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
