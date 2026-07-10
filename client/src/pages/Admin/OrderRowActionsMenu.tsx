import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { assignCourierToOrder, setCourierSalary, adminMarkOrderDelivered, markSendReturnedToSender, cancelOrderByAdmin, adminPostponeOrder, CANCELLATION_REASON_LABELS, NON_BILLABLE_CANCEL_REASONS, POSTPONE_REASON_LABELS } from '../../api/orders';
import type { CancellationReason, PostponeReason } from '../../api/orders';
import { assignReturnCourier } from '../../api/returnExchange';
import type { Courier } from '../../api/couriers';
import { useLanguage } from '../../contexts/useLanguage';
import './OrderRowActionsMenu.css';

/** Minimal order shape the menu needs — both Delivery pages can map their row to this. */
export interface RowMenuOrder {
  id: string;
  orderType: string;
  status: string;
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
  /** Print this order's parcel label. When omitted the item is hidden. */
  onLabel?: () => void;
  /** Refresh the list after an action mutates the order. */
  onChanged: () => void;
  onError: (msg: string) => void;
  /** Hide the View item — for callers whose row lacks the full order shape View needs. Default true. */
  showView?: boolean;
  /** Hide the Edit item — for callers whose row lacks the full order shape Edit needs. Default true. */
  showEdit?: boolean;
}

type Panel = 'menu' | 'assign' | 'salary' | 'deliver' | 'returnToSender' | 'cancelCharge' | 'postpone';

/**
 * Per-row kebab (⋮) menu for the Delivery / Packages tables. Bundles the single-order
 * actions — assign/reassign courier, set salary, mark delivered, view, edit — so an admin
 * can act on one order without entering bulk-select mode. Portaled to <body> and positioned
 * against the button so the table's overflow never clips it.
 */
export function OrderRowActionsMenu({
  order, couriers, token, canManage, canAssign, canDeliver, onView, onEdit, onLabel, onChanged, onError,
  showView = true, showEdit = true,
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>('menu');
  const [busy, setBusy] = useState(false);
  const [salaryInput, setSalaryInput] = useState('');
  const [cancelReason, setCancelReason] = useState<CancellationReason | null>(null);
  const [cancelComment, setCancelComment] = useState('');
  const [postponeReason, setPostponeReason] = useState<PostponeReason | null>(null);
  const [postponeComment, setPostponeComment] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const close = () => { setOpen(false); setPanel('menu'); };

  const activeCouriers = couriers.filter(c => !c.isDeleted);

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return; }
      // Type-ahead in the courier list: pressing a letter jumps to the first courier
      // whose name starts with it (and focuses it, so Enter assigns).
      if (panel === 'assign' && e.key.length === 1 && /\S/.test(e.key)) {
        const letter = e.key.toLowerCase();
        const idx = activeCouriers.findIndex(c => c.fullName.trim().toLowerCase().startsWith(letter));
        if (idx >= 0) {
          const item = listRef.current?.children[idx] as HTMLElement | undefined;
          item?.scrollIntoView({ block: 'nearest' });
          item?.focus();
        }
      }
    };
    // Close on page scroll (the fixed panel would otherwise drift), but ignore scrolling
    // *inside* the panel itself — e.g. the courier list — which must stay open.
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel, couriers]);

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
  const markReturned  = () => run(() => markSendReturnedToSender(token, order.id));
  const cancelCharge  = () => {
    if (!cancelReason) return;
    void run(() => cancelOrderByAdmin(token, order.id, {
      reason: cancelReason,
      comment: cancelReason === 'Other' ? cancelComment.trim() : undefined,
    }));
  };
  const postpone = () => {
    if (!postponeReason) return;
    void run(() => adminPostponeOrder(token, order.id, postponeReason,
      postponeReason === 'Other' ? postponeComment.trim() : undefined));
  };

  const showAssign  = canManage && canAssign;
  const showSalary  = canManage;
  const showDeliver = canManage && canDeliver && !!order.courierId;
  // Send/Exchange whose delivery failed (recipient refused) can be returned to the sender,
  // from the same active delivery states as "mark delivered". The sender still owes the fee.
  const showReturnToSender = canManage && canDeliver && !isReturn && !!order.courierId;
  // Admin "cancel & charge": mirrors the courier's cancel-with-reason — only once the order
  // reached a delivery courier. Records a billable CancellationReason so the sender is invoiced.
  const showCancelCharge = canManage && canDeliver && !isReturn && !!order.courierId;
  const canConfirmCancel = cancelReason !== null && (cancelReason !== 'Other' || cancelComment.trim().length > 0);
  // Admin postpone: once a courier is assigned (and while in-flight), mirroring the courier action.
  const showPostpone = canManage && !isReturn
    && (order.status === 'CourierAssignedToDeliver' || order.status === 'CourierDeliveringTheOrderToRecipient');
  const canConfirmPostpone = postponeReason !== null && (postponeReason !== 'Other' || postponeComment.trim().length > 0);

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
              {showView && <button className="orm-item" onClick={() => { onView(); close(); }}>{t.aopView}</button>}
              {canManage && showEdit && <button className="orm-item" onClick={() => { onEdit(); close(); }}>{t.aopEdit}</button>}
              {onLabel && <button className="orm-item" onClick={() => { onLabel(); close(); }}>{t.custLabelBtn}</button>}
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
              {showReturnToSender && (
                <button className="orm-item" onClick={() => setPanel('returnToSender')}>
                  {t.reMarkReturned} <span className="orm-chev">›</span>
                </button>
              )}
              {showPostpone && (
                <button className="orm-item" onClick={() => { setPostponeReason(null); setPostponeComment(''); setPanel('postpone'); }}>
                  {t.cdDeliveryBtnPostpone} <span className="orm-chev">›</span>
                </button>
              )}
              {showCancelCharge && (
                <button className="orm-item orm-item--cancel" onClick={() => { setCancelReason(null); setCancelComment(''); setPanel('cancelCharge'); }}>
                  {t.ormCancelCharge} <span className="orm-chev">›</span>
                </button>
              )}
            </>
          )}

          {panel === 'assign' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.aopModeAssign}</button>
              <div className="orm-courier-list" ref={listRef}>
                {activeCouriers.length === 0
                  ? <div className="orm-empty">{t.goChooseCourierOption}</div>
                  : activeCouriers.map(c => (
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

          {panel === 'returnToSender' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.reMarkReturned}</button>
              <button className="orm-confirm" disabled={busy} onClick={markReturned}>
                {busy ? t.aopSaving : t.goConfirm}
              </button>
            </div>
          )}

          {panel === 'cancelCharge' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.ormCancelCharge}</button>
              <div className="orm-courier-list">
                {(Object.keys(CANCELLATION_REASON_LABELS) as CancellationReason[]).map(reason => {
                  // Green = no charge to the customer (cancelled before delivery); red = billable.
                  const reasonColor = NON_BILLABLE_CANCEL_REASONS.has(reason) ? '#059669' : '#dc2626';
                  return (
                  <button key={reason} className="orm-item"
                    style={{ color: reasonColor, fontWeight: cancelReason === reason ? 700 : 500,
                      background: cancelReason === reason ? 'var(--color-accent-dim)' : undefined }}
                    onClick={() => setCancelReason(reason)}>
                    {t.cdCancelReasons[reason]}
                  </button>
                  );
                })}
              </div>
              {cancelReason === 'Other' && (
                <div className="orm-field">
                  <input type="text" autoFocus placeholder={t.cdCancelCommentPlaceholder} value={cancelComment}
                    maxLength={500} onChange={e => setCancelComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && canConfirmCancel) cancelCharge(); }} />
                </div>
              )}
              <button className="orm-confirm" disabled={busy || !canConfirmCancel} onClick={cancelCharge}>
                {busy ? t.aopSaving : t.goConfirm}
              </button>
            </div>
          )}

          {panel === 'postpone' && (
            <div className="orm-sub">
              <button className="orm-sub-head" onClick={() => setPanel('menu')}>‹ {t.cdDeliveryBtnPostpone}</button>
              <div className="orm-courier-list">
                {(Object.keys(POSTPONE_REASON_LABELS) as PostponeReason[]).map(reason => (
                  <button key={reason} className="orm-item"
                    style={{ fontWeight: postponeReason === reason ? 700 : 500,
                      background: postponeReason === reason ? 'var(--color-accent-dim)' : undefined }}
                    onClick={() => setPostponeReason(reason)}>
                    {t.cdPostponeReasons[reason]}
                  </button>
                ))}
              </div>
              {postponeReason === 'Other' && (
                <div className="orm-field">
                  <input type="text" autoFocus placeholder={t.cdPostponeCommentPlaceholder} value={postponeComment}
                    maxLength={500} onChange={e => setPostponeComment(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && canConfirmPostpone) postpone(); }} />
                </div>
              )}
              <button className="orm-confirm" disabled={busy || !canConfirmPostpone} onClick={postpone}>
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
