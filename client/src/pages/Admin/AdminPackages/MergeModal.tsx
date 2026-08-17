// Merge same-day batches from the same customer into one (copied from AdminDashboard.tsx).
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../contexts/useLanguage';
import { mergeGroupOrders } from '../../../api/adminGroupOrders';
import type { AdminGroupOrder } from '../../../api/adminGroupOrders';
import { StatusBadge } from './Badges';
import { formatDate } from './shared';

export function MergeModal({ customerName, batches, token, onClose, onMerged }: {
  customerName: string; batches: AdminGroupOrder[]; token: string; onClose: () => void; onMerged: () => void;
}) {
  const { t, lang } = useLanguage();
  const locCity = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
  const [targetId,  setTargetId]  = useState(batches[0]?.id ?? '');
  const [sourceIds, setSourceIds] = useState<Set<string>>(() => new Set(batches.slice(1).map(b => b.id)));
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chooseTarget = (id: string) => { setTargetId(id); setSourceIds(prev => { const next = new Set(prev); next.delete(id); return next; }); };
  const toggleSource = (id: string) => { if (id === targetId) return; setSourceIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const selectedSources = [...sourceIds].filter(id => id !== targetId);

  const handleMerge = async () => {
    if (!targetId || selectedSources.length === 0) return;
    setBusy(true); setError(null);
    try { await mergeGroupOrders(token, targetId, selectedSources); onMerged(); }
    catch (e) { setError(e instanceof Error ? e.message : t.pickupMergeError); }
    finally { setBusy(false); }
  };

  return createPortal(
    <div className="pickup-modal__overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="pickup-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="pickup-modal__header">
          <div>
            <h3 className="pickup-modal__title">{t.pickupMergeBtn} — {customerName}</h3>
            <p className="pickup-modal__subtitle">{t.pickupMergeModalSubtitle}</p>
          </div>
          <button className="pickup-modal__close" onClick={onClose} disabled={busy} aria-label={t.close}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>
        <div className="pickup-modal__body">
          <table className="go-orders-table" style={{ minWidth: 0 }}>
            <thead><tr>
              <th style={{ width: 48, textAlign: 'center' }}>{t.pickupMergeKeep}</th>
              <th style={{ width: 60, textAlign: 'center' }}>{t.pickupMergeInto}</th>
              <th>{t.goColPackages}</th><th>{t.goColStatus}</th><th>{t.cgoPickupLocation}</th><th>{t.goColDate}</th>
            </tr></thead>
            <tbody>
              {batches.map(b => (
                <tr key={b.id}>
                  <td style={{ textAlign: 'center' }}><input type="radio" name="merge-target-pkg" checked={targetId === b.id} onChange={() => chooseTarget(b.id)} /></td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" disabled={targetId === b.id} checked={targetId !== b.id && sourceIds.has(b.id)} onChange={() => toggleSource(b.id)} /></td>
                  <td>{t.goPkgs(b.numberOfPackages)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td>{locCity(b.pickUpCity, b.pickUpCityGeo)}{b.pickUpAddress ? `, ${b.pickUpAddress}` : ''}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(b.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {error && <div className="pickup-modal__error">{error}</div>}
        </div>
        <div className="pickup-modal__footer">
          <button className="go-action-btn go-action-btn--ghost" onClick={onClose} disabled={busy}>{t.cancel}</button>
          <button className="go-action-btn go-action-btn--city" onClick={handleMerge} disabled={busy || selectedSources.length === 0}>{busy ? t.pickupMerging : t.pickupMergeBtn}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
