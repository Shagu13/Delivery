// Bulk "fill in the missing salary/price" modal — used both as the direct "set prices" bulk
// action and as the gating step before assign/deliver when packages are missing financials.
// Salary and price used to be two near-identical hand-copied modals; the only real
// differences are which field is being edited and whether the read-only service-price/revenue
// columns show (they only make sense next to a salary being set, not next to the price itself).
import { useState, type Dispatch, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../contexts/useLanguage';
import type { AdminOrderItem } from '../AdminOrdersPage';
import { pickupCityDisplay, pickupDistrictDisplay, pickupAddressDisplay } from './shared';

export function BulkFieldModal({
  field, orders, drafts, setDrafts, checked, setChecked, saving, canSeeRevenue, onSave, onClose,
}: {
  field: 'salary' | 'price';
  orders: AdminOrderItem[];
  drafts: Record<string, string>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  checked: Set<string>;
  setChecked: Dispatch<SetStateAction<Set<string>>>;
  saving: boolean;
  canSeeRevenue: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const [applyValue, setApplyValue] = useState('');
  const isSalary = field === 'salary';
  const allChecked = orders.length > 0 && orders.every(o => checked.has(o.id));

  const applyToTargets = () => {
    if (!applyValue) return;
    const targets = checked.size > 0 ? [...checked] : orders.map(o => o.id);
    setDrafts(prev => { const next = { ...prev }; targets.forEach(id => { next[id] = applyValue; }); return next; });
    setChecked(prev => { const next = new Set(prev); targets.forEach(id => next.add(id)); return next; });
    setApplyValue('');
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: isSalary ? 740 : 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>{isSalary ? t.aopSetSalary : t.aopSetPrice}</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{isSalary ? t.aopMissingSalaryCount(orders.length) : t.aopMissingPriceCount(orders.length)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: 4 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', marginBottom: 12, background: 'var(--color-accent-dim)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>{checked.size > 0 ? t.aopApplyToSel(checked.size) : t.aopApplyToAll}</span>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0, border: '1px solid var(--color-border)', borderRadius: 6, overflow: 'hidden', background: 'var(--color-bg-2)' }}>
            <span style={{ padding: '0 6px 0 10px', fontSize: '0.85rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>₾</span>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={applyValue} onChange={e => setApplyValue(e.target.value)} style={{ flex: 1, minWidth: 0, padding: '6px 8px 6px 2px', border: 'none', outline: 'none', background: 'transparent', color: 'var(--color-text)', fontSize: '0.88rem' }} />
          </div>
          <button onClick={applyToTargets} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', flexShrink: 0, background: 'var(--color-accent)', color: '#fff', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>{t.aopApplyValue}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
          <input type="checkbox" style={{ cursor: 'pointer' }} checked={allChecked} onChange={e => setChecked(e.target.checked ? new Set(orders.map(o => o.id)) : new Set())} />
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopSelectAllN(orders.length)}</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead><tr style={{ background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ width: 28, padding: '6px 4px' }}></th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThTracking}</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopColAddress}</th>
              {isSalary && <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThSvcPrice}</th>}
              <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{isSalary ? t.aopThSalary : t.aopThSvcPrice}</th>
              {isSalary && canSeeRevenue && <th style={{ textAlign: 'right', padding: '6px 8px', color: 'var(--color-text-subtle)', fontWeight: 600 }}>{t.aopThRevenue}</th>}
            </tr></thead>
            <tbody>
              {orders.map(o => {
                const draftValue = parseFloat(drafts[o.id] ?? '');
                const revenue = isSalary && !isNaN(draftValue) ? o.companyServicePrice - draftValue : null;
                const isChecked = checked.has(o.id);
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)', background: isChecked ? 'var(--color-accent-dim)' : 'var(--color-bg-2)' }}>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}><input type="checkbox" style={{ cursor: 'pointer' }} checked={isChecked} onChange={() => setChecked(prev => { const next = new Set(prev); isChecked ? next.delete(o.id) : next.add(o.id); return next; })} /></td>
                    <td style={{ padding: '6px 8px' }}>
                      <span className="tn-badge">{o.trackingNumber}</span>
                      {isSalary && o.senderBusinessName && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>{o.senderBusinessName}</div>}
                    </td>
                    <td style={{ padding: '6px 8px', maxWidth: isSalary ? 200 : 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.8rem' }}>{pickupCityDisplay(o, lang)}, {pickupDistrictDisplay(o, lang)}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{pickupAddressDisplay(o)}</div>
                    </td>
                    {isSalary && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)' }}>₾{o.companyServicePrice.toFixed(2)}</td>}
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>₾</span>
                        <input type="number" min="0" step="0.01" placeholder="0.00" value={drafts[o.id] ?? ''} onChange={e => { setDrafts(prev => ({ ...prev, [o.id]: e.target.value })); if (e.target.value) setChecked(prev => { const n = new Set(prev); n.add(o.id); return n; }); }} style={{ width: 72, textAlign: 'right', padding: '3px 6px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.83rem' }} />
                      </div>
                    </td>
                    {isSalary && canSeeRevenue && <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{revenue !== null ? <span style={{ color: revenue >= 0 ? '#10b981' : '#ef4444' }}>₾{revenue.toFixed(2)}</span> : <span style={{ color: 'var(--color-text-subtle)' }}>—</span>}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <button onClick={onClose} disabled={saving} style={{ padding: '8px 18px', borderRadius: 7, border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>{t.close}</button>
          <button onClick={onSave} disabled={saving || checked.size === 0} style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: 'var(--color-accent)', color: '#fff', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, opacity: (saving || checked.size === 0) ? 0.6 : 1 }}>{saving ? t.aopSaving : t.aopSaveWithCount(checked.size)}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
