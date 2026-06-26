import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchCourierOrderFinanceAdmin,
    recordCourierPayment,
    OrderFinanceApiError,
} from '../../api/orderFinance';
import type { OrderFinanceLine } from '../../api/orderFinance';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';

interface Props {
    open: boolean;
    onClose: () => void;
    /** Called after any per-order payment change so the parent can refresh overview figures. */
    onCreated: () => void;
    courierId: string;
    courierFullName: string;
    token: string;
    /** Date the modal should open on (YYYY-MM-DD). Defaults to today. */
    initialDate?: string;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function stepDay(iso: string, delta: number): string {
    const d = new Date(iso);
    d.setDate(d.getDate() + delta);
    return d.toISOString().slice(0, 10);
}

function fmt(n: number) { return `₾${n.toFixed(2)}`; }

export function SettlementModal({
    open,
    onClose,
    onCreated,
    courierId,
    courierFullName,
    token,
    initialDate,
}: Props) {
    const { t } = useLanguage();
    const [date,    setDate]    = useState(initialDate ?? todayIso());
    const [lines,   setLines]   = useState<OrderFinanceLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyId,  setBusyId]  = useState<string | null>(null);
    const [error,   setError]   = useState<string | null>(null);

    // `silent` refreshes the line data in place without flipping the full-screen spinner —
    // used after a per-order pay toggle so the table stays mounted and the modal keeps its
    // scroll position instead of collapsing to a spinner and jumping back to the top.
    const load = useCallback(async (d: string, silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const data = await fetchCourierOrderFinanceAdmin(courierId, token, d);
            setLines(data);
        } catch (err) {
            setError(err instanceof OrderFinanceApiError ? err.message : 'Failed to load orders.');
            if (!silent) setLines([]);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [courierId, token]);

    useEffect(() => {
        if (open) {
            const start = initialDate ?? todayIso();
            setDate(start);
            load(start);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const handleDateChange = (d: string) => { setDate(d); load(d); };

    const toggle = async (o: OrderFinanceLine, flow: 'salary' | 'cod') => {
        setBusyId(o.orderId);
        setError(null);
        try {
            await recordCourierPayment(
                flow === 'salary'
                    ? { orderId: o.orderId, salaryPaid: !o.isCourierSalaryPaid }
                    : { orderId: o.orderId, codTransferred: !o.hasCourierTransferedAmount },
                token,
            );
            await load(date, true);   // silent — keep the table mounted & scroll position intact
            onCreated();
        } catch (err) {
            setError(err instanceof OrderFinanceApiError ? err.message : 'Failed to record payment.');
        } finally {
            setBusyId(null);
        }
    };

    if (!open) return null;

    // ── Day totals (derived live from the order lines) ───────────────────────────
    const delivered      = lines.length;
    const salaryEarned   = lines.reduce((s, o) => s + (o.courierSalary ?? 0), 0);
    const salaryPaid     = lines.reduce((s, o) => s + (o.courierSalaryPaidAmount ?? 0), 0);
    const cashCollected  = lines.reduce((s, o) => s + (o.amountOfCashCollected ?? 0), 0);
    const transferred    = lines.reduce((s, o) => s + (o.codTransferedToCompanyByCourier ?? 0), 0);
    const netIncome      = lines.reduce((s, o) => s + o.companyNetCash, 0);
    const salaryUnpaid   = salaryEarned - salaryPaid;

    return createPortal(
        <>
            <div className="modal-backdrop" onClick={onClose} />
            <div className="modal settlement-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-title">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="modal__header">
                    <div>
                        <p className="modal__eyebrow">{t.stlmEyebrow}</p>
                        <h2 className="modal__title" id="settlement-title">{courierFullName}</h2>
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label={t.close}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <div className="modal__body">
                    {/* ── Date picker ──────────────────────────────────────── */}
                    <fieldset className="modal__fieldset">
                        <legend className="modal__legend">{t.stlmDateLegend}</legend>
                        <div className="stl-date-nav">
                            <button type="button" className="stl-date-arrow"
                                onClick={() => handleDateChange(stepDay(date, -1))} aria-label="Previous day">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <input type="date" value={date} max={todayIso()}
                                onChange={e => handleDateChange(e.target.value)} className="settlement-date-input" />
                            <button type="button" className="stl-date-arrow"
                                onClick={() => handleDateChange(stepDay(date, 1))}
                                disabled={date >= todayIso()} aria-label="Next day">
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </fieldset>

                    {error && (
                        <div className="modal__global-error" role="alert">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {loading && (
                        <div className="go-loading">
                            <div className="go-spinner" />
                            {t.stlmLoadingDate(date)}
                        </div>
                    )}

                    {!loading && (
                        <>
                            {/* ── Counts ───────────────────────────────────── */}
                            <div className="stl-counts">
                                <div className="stl-count-card">
                                    <span className="stl-count-label">{t.stlmDelivered}</span>
                                    <span className="stl-count-value">{delivered}</span>
                                </div>
                            </div>

                            {/* ── Day financial summary (read-only, derived) ── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.stlmFinancialSummary}</legend>
                                <div className="stl-fin-rows">
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmCourierSalary}</span>
                                        <span className="stl-fin-value stl-fin-value--salary">{fmt(salaryEarned)}</span>
                                    </div>
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.finHisThPaid}</span>
                                        <span className="stl-fin-value stl-fin-value--income">{fmt(salaryPaid)}</span>
                                    </div>
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.finHisThOutstanding}</span>
                                        <span className="stl-fin-value" style={{ color: salaryUnpaid > 0.005 ? '#b45309' : '#10b981' }}>{fmt(salaryUnpaid)}</span>
                                    </div>
                                    <div className="stl-fin-divider" />
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmTotalCash}</span>
                                        <span className="stl-fin-value">{fmt(cashCollected)}</span>
                                    </div>
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmCourierToCompany}</span>
                                        <span className="stl-fin-value stl-fin-value--transfer">{fmt(transferred)}</span>
                                    </div>
                                    <div className="stl-fin-divider" />
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmNetIncome}</span>
                                        <span className="stl-fin-value stl-fin-value--income">{fmt(netIncome)}</span>
                                    </div>
                                </div>
                            </fieldset>

                            {/* ── Per-order rows with salary / COD toggles ──── */}
                            {lines.length > 0 ? (
                                <fieldset className="modal__fieldset">
                                    <legend className="modal__legend">{t.stlmDeliveredOrders(lines.length)}</legend>
                                    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                        <table className="go-orders-table settlement-orders-table">
                                            <thead>
                                                <tr>
                                                    <th>{t.stlmThTracking}</th>
                                                    <th>{t.stlmThRecipient}</th>
                                                    <th>{t.stlmThPayer}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThSalary}</th>
                                                    <th style={{ textAlign: 'center' }}>{t.stlmSalaryEarned}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThCod}</th>
                                                    <th style={{ textAlign: 'center' }}>{t.stlmCourierToCompany}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {lines.map(o => {
                                                    const busy = busyId === o.orderId;
                                                    return (
                                                        <tr key={o.orderId}>
                                                            <td><span className="tn-badge">{o.trackingNumber}</span></td>
                                                            <td style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</td>
                                                            <td>
                                                                <span className={`stl-payer-badge stl-payer-badge--${o.whoPaysForCompanyService.toLowerCase()}`}>
                                                                    {o.whoPaysForCompanyService === 'Recipient' ? t.stlmRcpt : t.stlmSndr}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#f97316', fontWeight: 600 }}>
                                                                {o.courierSalary != null ? fmt(o.courierSalary) : <Dash />}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <PayToggle on={o.isCourierSalaryPaid} busy={busy} onClick={() => toggle(o, 'salary')} />
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: 'var(--color-text-subtle)' }}>
                                                                {o.amountOfCashCollected != null ? fmt(o.amountOfCashCollected) : <Dash />}
                                                            </td>
                                                            <td style={{ textAlign: 'center' }}>
                                                                <PayToggle on={o.hasCourierTransferedAmount} busy={busy} onClick={() => toggle(o, 'cod')} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </fieldset>
                            ) : (
                                <p style={{ textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem', padding: '8px 0' }}>
                                    {t.stlmNoOrders(date)}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────────── */}
                <div className="modal__footer" style={{ padding: '16px 24px' }}>
                    <button type="button" className="modal__btn-cancel" onClick={onClose}>
                        {t.close}
                    </button>
                </div>
            </div>

            <style>{`
                .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
                .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22),0 4px 16px rgba(0,0,0,0.1);animation:modal-slide-up 0.22s ease both; }
                .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
                .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
                .modal__title { font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.025em;color:var(--color-text);margin:0; }
                .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition),color var(--transition);flex-shrink:0; }
                .modal__close:hover { background:var(--color-border);color:var(--color-text); }
                .modal__body { padding:20px 24px;display:flex;flex-direction:column;gap:16px; }
                .modal__fieldset { border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:14px 16px;margin:0; }
                .modal__legend { font-size:0.68rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--color-text-subtle);padding:0 6px; }
                .modal__global-error { display:flex;align-items:center;gap:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:#ef4444;font-size:0.825rem;padding:10px 14px; }
                .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid var(--color-border); }
                .modal__btn-cancel { padding:10px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer;transition:background var(--transition),border-color var(--transition),color var(--transition); }
                .modal__btn-cancel:hover:not(:disabled) { background:var(--color-bg-3);border-color:var(--color-text-muted);color:var(--color-text); }
                .go-loading { display:flex;align-items:center;gap:10px;color:var(--color-text-subtle);font-size:0.875rem;padding:8px 0; }
                .go-spinner { width:16px;height:16px;border:2px solid var(--color-border);border-top-color:var(--color-accent);border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0; }
                @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
                @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 16px))} to{opacity:1;transform:translate(-50%,-50%)} }
                @keyframes spin { to{transform:rotate(360deg)} }

                .settlement-modal { width:min(820px,calc(100vw - 32px)); }
                .stl-date-nav { display:flex;align-items:center;gap:6px; }
                .stl-date-arrow { display:flex;align-items:center;justify-content:center;width:30px;height:34px;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition),color var(--transition),border-color var(--transition);flex-shrink:0; }
                .stl-date-arrow:hover:not(:disabled) { background:var(--color-border);color:var(--color-text); }
                .stl-date-arrow:disabled { opacity:0.35;cursor:not-allowed; }
                .settlement-date-input { background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text);font-size:0.875rem;padding:8px 12px;outline:none;font-family:var(--font-body);transition:border-color var(--transition); }
                .settlement-date-input:focus { border-color:var(--color-accent); }
                .settlement-orders-table { font-size:0.8rem; }
                .settlement-orders-table th { font-size:0.62rem; }

                .stl-counts { display:flex;gap:12px; }
                .stl-count-card { flex:1;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:12px 16px;display:flex;flex-direction:column;gap:4px; }
                .stl-count-label { font-size:0.68rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-subtle); }
                .stl-count-value { font-size:1.5rem;font-weight:800;color:var(--color-text);font-family:var(--font-display); }

                .stl-fin-rows { display:flex;flex-direction:column;gap:10px; }
                .stl-fin-row { display:flex;align-items:baseline;justify-content:space-between;gap:12px; }
                .stl-fin-label { font-size:0.875rem;color:var(--color-text-subtle);display:flex;flex-direction:column;gap:2px; }
                .stl-fin-value { font-size:0.9rem;font-weight:600;color:var(--color-text);font-family:'Courier New',monospace;white-space:nowrap; }
                .stl-fin-value--salary { color:#f97316; }
                .stl-fin-value--income { color:#10b981; }
                .stl-fin-value--transfer { color:var(--color-accent); }
                .stl-fin-divider { border:none;border-top:1px solid var(--color-border);margin:2px 0; }

                .stl-payer-badge { display:inline-block;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:0.04em; }
                .stl-payer-badge--recipient { background:rgba(196,127,23,0.12);color:#c47f17; }
                .stl-payer-badge--sender { background:rgba(99,102,241,0.1);color:#818cf8; }

                .stl-toggle { display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:100px;border:1px solid var(--color-border);background:var(--color-bg-3);color:var(--color-text-muted);font-size:0.7rem;font-weight:700;cursor:pointer;transition:all var(--transition); }
                .stl-toggle:hover:not(:disabled) { border-color:var(--color-text-muted); }
                .stl-toggle:disabled { opacity:0.5;cursor:wait; }
                .stl-toggle--on { background:rgba(5,150,105,0.12);border-color:rgba(5,150,105,0.3);color:#059669; }
            `}</style>
        </>,
        document.body
    );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function PayToggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
    const { t } = useLanguage();
    return (
        <button type="button" className={`stl-toggle ${on ? 'stl-toggle--on' : ''}`} disabled={busy} onClick={onClick}>
            {on ? (
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ) : null}
            {on ? t.stlmPaid : t.stlmMarkPaid}
        </button>
    );
}

function Dash() {
    return <span style={{ opacity: 0.4, fontSize: '0.78rem' }}>—</span>;
}
