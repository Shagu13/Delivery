import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { assignCourierToOrder, setCourierSalary, adminMarkOrderDelivered } from '../../api/orders';
import { assignReturnCourier } from '../../api/returnExchange';
import type { Courier } from '../../api/couriers';
import { useLanguage } from '../../contexts/useLanguage';
import './OrderRowActionsMenu.css';

/** Minimal order shape the menu needs — both Delivery pages can map their row to this. */
export interface RowMenuOrder {
  id: string;
  orderType: string;
  courierId: string | null;
  courierSalary: number | null;
}

interface Props {
  order: RowMenuOrder;
  couriers: Courier[];
  token: string;
  canManage: boolean;
  /** Order is in a state where a delivery courier can be (re)assigned. */
  canAssign: boolean;
  /** Order can be marked delivered to the recipient. */
  canDeliver: boolean;
  onView: () => void;
  onEdit: () => void;
  /** Refresh the list after an action mutates the order. */
  onChanged: () => void;
  onError: (msg: string) => void;
}

type Panel = 'menu' | 'assign' | 'salary' | 'deliver';

/**
 * Per-row kebab (⋮) menu for the Delivery / Packages tables. Bundles the single-order
 * actions — assign/reassign courier, set salary, mark delivered, view, edit — so an admin
 * can act on one order without entering bulk-select mode. Portaled to <body> and positioned
 * against the button so the table's overflow never clips it.
 */
export function OrderRowActionsMenu({
  order, couriers, token, canManage, canAssign, canDeliver, onView, onEdit, onChanged, onError,
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('menu');
  const [busy, setBusy] = useState(false);
  const [salaryInput, setSalaryInput] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => { setOpen(false); setPanel('menu'); };

  // Anchor the portal panel to the button; flip upward when there's no room below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 210;
    const left = Math.max(8, r.right - menuW);
    const top = r.bottom + 280 > window.innerHeight ? Math.max(8, r.top - 4 - 280) : r.bottom + 4;
    setPos({ top, left });
  }, [open, panel]);

  // Dismiss on outside click, Escape, or any scroll (panel position would otherwise drift).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = () => close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); onChanged(); close(); }
    catch (e) { onError(e instanceof Error ? e.message : t.goActionFailed); }
    finally { setBusy(false); }
  };

  const isReturn = order.orderType === 'Return';
  const assign = (courierId: string) => run(() =>
    isReturn ? assignReturnCourier(token, order.id, courierId)
             : assignCourierToOrder(token, order.id, courierId));
  const saveSalary = () => {
    const v = parseFloat(salaryInput);
    if (isNaN(v) || v < 0) return;
    void run(() => setCourierSalary(token, order.id, v));
  };
  const markDelivered = () => run(() => adminMarkOrderDelivered(token, order.id));

  const showAssign  = canManage && canAssign;
  const showSalary  = canManage;
  const showDeliver = canManage && canDeliver && !!order.courierId;

  return (
    <>
      <button ref={btnRef} type="button" className="orm-kebab" title={t.goThActions}
        onClick={e => { e.stopPropagation(); setPanel('menu'); setOpen(o => !o); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div ref={menuRef} className="orm-menu" style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}>

          {panel === 'menu' && (
            <>
              <button className="orm-item" onClick={() => { onView(); close(); }}>{t.aopView}</button>
              {canManage && <button className="orm-item" onClick={() => { onEdit(); close(); }}>{t.aopEdit}</button>}
              {showAssign && (
                <button className="orm-item" onClick={() => setPanel('assign')}>
                  {order.courierId ? t.goReassignCourierBtn : t.aopModeAssign} <span className="orm-chev">›</span>
                </button>
              )}
              {showSalary && (
                <button className="orm-item" onClick={() => {
                  setSalaryInput(order.courierSalary != null ? String(order.courierSalary) : '');
                  setPanel('salary');
                }}>
                  {t.aopSetSalary} <span className="orm-chev">›</span>
                </button>
              )}
              {showDeliver && (
                <button className="orm-item orm-item--deliver" onClick={() => setPanel('deliver')}>
                  {t.aopModeDeliver} <span className="orm-chev">›</span>
                </button>
              )}
            </>
          )}

          {panel === 'assign' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.aopModeAssign}</button>
              <div className="orm-courier-list">
                {couriers.filter(c => !c.isDeleted).length === 0
                  ? <div className="orm-empty">{t.goChooseCourierOption}</div>
                  : couriers.filter(c => !c.isDeleted).map(c => (
                      <button key={c.courierId} className="orm-item" disabled={busy}
                        onClick={() => assign(c.courierId)}>{c.fullName}</button>
                    ))}
              </div>
            </div>
          )}

          {panel === 'salary' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.aopSetSalary}</button>
              <div className="orm-field">
                <span className="orm-currency">₾</span>
                <input type="number" min="0" step="0.01" autoFocus placeholder="0.00" value={salaryInput}
                  onChange={e => setSalaryInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveSalary(); }} />
              </div>
              <button className="orm-confirm" disabled={busy || salaryInput === ''} onClick={saveSalary}>
                {busy ? t.aopSaving : t.goConfirm}
              </button>
            </div>
          )}

          {panel === 'deliver' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.aopModeDeliver}</button>
              <button className="orm-confirm orm-confirm--deliver" disabled={busy} onClick={markDelivered}>
                {busy ? t.aopSaving : t.goConfirm}
              </button>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
