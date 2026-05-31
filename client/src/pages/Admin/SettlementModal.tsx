import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchSettlementPreview,
    createSettlement,
    updateSettlement,
    SettlementApiError,
} from '../../api/settlements';
import type { SettlementPreview } from '../../api/settlements';

interface Props {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
    courierId: string;
    courierFullName: string;
    token: string;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function fmt(n: number) { return `₾${n.toFixed(2)}`; }

export function SettlementModal({
    open,
    onClose,
    onCreated,
    courierId,
    courierFullName,
    token,
}: Props) {
    const [date,          setDate]          = useState(todayIso());
    const [preview,       setPreview]       = useState<SettlementPreview | null>(null);
    const [loading,       setLoading]       = useState(false);
    const [saving,        setSaving]        = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [alreadyExists, setAlreadyExists] = useState(false);

    const loadPreview = useCallback(async (d: string) => {
        setLoading(true);
        setError(null);
        setPreview(null);
        setAlreadyExists(false);
        try {
            const data = await fetchSettlementPreview(courierId, d, token);
            setPreview(data);
            setAlreadyExists(!!data.existingSettlementId);
        } catch (err) {
            setError(err instanceof SettlementApiError ? err.message : 'Failed to load preview.');
        } finally {
            setLoading(false);
        }
    }, [courierId, token]);

    useEffect(() => {
        if (open) loadPreview(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const handleDateChange = (d: string) => { setDate(d); loadPreview(d); };

    const handleSave = async () => {
        if (!preview) return;
        setSaving(true);
        setError(null);
        try {
            if (alreadyExists) {
                await updateSettlement({ courierId, date }, token);
            } else {
                try {
                    await createSettlement({ courierId, date }, token);
                } catch (err) {
                    // 409 = already exists — switch to update mode and retry
                    if (err instanceof SettlementApiError && err.status === 409) {
                        setAlreadyExists(true);
                        await updateSettlement({ courierId, date }, token);
                    } else {
                        throw err;
                    }
                }
            }
            onCreated();
            onClose();
        } catch (err) {
            setError(err instanceof SettlementApiError ? err.message : 'Failed to save settlement.');
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    const hasIncomplete = (preview?.incompleteOrderTrackingNumbers ?? []).length > 0;

    return createPortal(
        <>
            <div className="modal-backdrop" onClick={onClose} />
            <div className="modal settlement-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-title">

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="modal__header">
                    <div>
                        <p className="modal__eyebrow">Daily Settlement</p>
                        <h2 className="modal__title" id="settlement-title">{courierFullName}</h2>
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <div className="modal__body">
                    {/* ── Date picker ──────────────────────────────────────── */}
                    <fieldset className="modal__fieldset">
                        <legend className="modal__legend">Settlement Date</legend>
                        <input
                            type="date"
                            value={date}
                            max={todayIso()}
                            onChange={e => handleDateChange(e.target.value)}
                            className="settlement-date-input"
                        />
                    </fieldset>

                    {error && !alreadyExists && (
                        <div className="modal__global-error" role="alert">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {alreadyExists && (
                        <div style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: 'var(--radius-sm)', color: '#6366f1',
                            fontSize: '0.825rem', padding: '10px 14px', lineHeight: 1.5,
                        }} role="alert">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 7v5M8 5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            <div>
                                <strong>A settlement already exists for this day.</strong>
                                {' '}Click <strong>Update Settlement</strong> to recalculate all totals from the current delivered orders.
                                Confirmed payments will not be changed.
                            </div>
                        </div>
                    )}

                    {hasIncomplete && (
                        <div className="settlement-warning" role="alert">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                <path d="M8 6v4M8 11.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            <div>
                                <strong>Missing financial data on {preview!.incompleteOrderTrackingNumbers.length} order{preview!.incompleteOrderTrackingNumbers.length !== 1 ? 's' : ''}:</strong>
                                {' '}{preview!.incompleteOrderTrackingNumbers.join(', ')}. Set CourierSalary, CompanyServicePrice and CompanyRevenue before saving.
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="go-loading">
                            <div className="go-spinner" />
                            Loading data for {date}…
                        </div>
                    )}

                    {!loading && preview && (
                        <>
                            {/* ── Order counts ─────────────────────────────── */}
                            <div className="stl-counts">
                                <div className="stl-count-card">
                                    <span className="stl-count-label">Packages Picked Up</span>
                                    <span className="stl-count-value">{preview.totalOrdersPickedUp}</span>
                                </div>
                                <div className="stl-count-card">
                                    <span className="stl-count-label">Orders Delivered</span>
                                    <span className="stl-count-value">{preview.totalOrdersDelivered}</span>
                                </div>
                            </div>

                            {/* ── Cash breakdown ───────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Cash Breakdown</legend>
                                <div className="stl-cash-breakdown">
                                    {/* Row 1: COD */}
                                    <div className="stl-cash-row">
                                        <div className="stl-cash-label">
                                            <span className="stl-cash-dot stl-cash-dot--cod" />
                                            <span>COD — Cash collected for parcels</span>
                                        </div>
                                        <span className="stl-cash-amount">{fmt(preview.totalAmountOfCashCollected)}</span>
                                    </div>
                                    {/* Row 2: Service fees from recipients */}
                                    <div className="stl-cash-row">
                                        <div className="stl-cash-label">
                                            <span className="stl-cash-dot stl-cash-dot--svc" />
                                            <span>Service fees collected from recipients</span>
                                        </div>
                                        <span className="stl-cash-amount">{fmt(preview.totalServiceFeesCollectedFromRecipients)}</span>
                                    </div>
                                    {/* Divider + total */}
                                    <div className="stl-cash-divider" />
                                    <div className="stl-cash-row stl-cash-row--total">
                                        <div className="stl-cash-label">
                                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                                                <path d="M5.5 8.5L7.5 10.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                            <strong>Total cash courier holds</strong>
                                        </div>
                                        <span className="stl-cash-amount stl-cash-amount--total">{fmt(preview.totalCashCourierHolds)}</span>
                                    </div>
                                </div>
                            </fieldset>

                            {/* ── Financial summary ────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Financial Summary</legend>
                                <div className="stl-summary-grid">
                                    <SummaryRow label="Total Service Revenue" value={fmt(preview.totalCompanyServiceRevenue)} hint="All CompanyServicePrice (sender + recipient)" />
                                    <SummaryRow label="Courier Salary" value={fmt(preview.totalCourierSalary)} color="#f97316" />
                                    <SummaryRow label="Company Net Income" value={fmt(preview.totalCompanyNetIncome)} color={preview.totalCompanyNetIncome >= 0 ? '#10b981' : '#ef4444'} />
                                    <SummaryRow label="Courier Transfer to Company" value={fmt(preview.totalCourierTransferToCompany)} color={preview.totalCourierTransferToCompany >= 0 ? 'var(--color-accent)' : '#ef4444'} hint="Total cash held − salary" bold />
                                </div>
                            </fieldset>

                            {/* ── Orders table ─────────────────────────────── */}
                            {preview.orders.length > 0 && (
                                <fieldset className="modal__fieldset">
                                    <legend className="modal__legend">
                                        Delivered Orders ({preview.orders.length})
                                    </legend>
                                    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                        <table className="go-orders-table settlement-orders-table">
                                            <thead>
                                                <tr>
                                                    <th>Tracking №</th>
                                                    <th>Recipient</th>
                                                    <th>City</th>
                                                    <th>Payer</th>
                                                    <th style={{ textAlign: 'right' }}>Svc ₾</th>
                                                    <th style={{ textAlign: 'right' }}>Salary ₾</th>
                                                    <th style={{ textAlign: 'right' }}>Revenue ₾</th>
                                                    <th style={{ textAlign: 'right' }}>COD ₾</th>
                                                    <th>Delivered</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.orders.map(o => {
                                                    const incomplete =
                                                        !o.courierSalary || o.courierSalary <= 0 ||
                                                        o.companyServicePrice <= 0 ||
                                                        o.companyRevenue == null;
                                                    const svcFromRecipient = o.whoPaysForCompanyService === 'Recipient';
                                                    return (
                                                        <tr key={o.id} style={incomplete ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                                                            <td>
                                                                <span className="tn-badge">{o.trackingNumber}</span>
                                                                {incomplete && <span style={{ marginLeft: 6, color: '#ef4444', fontSize: '0.7rem', fontWeight: 700 }}>⚠</span>}
                                                            </td>
                                                            <td style={{ fontWeight: 600 }}>{o.recipientName}</td>
                                                            <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>
                                                                {o.recipientCity}<br />
                                                                <span style={{ fontSize: '0.72rem' }}>{o.recipientDistrict}</span>
                                                            </td>
                                                            <td>
                                                                <span className={`stl-payer-badge${svcFromRecipient ? ' stl-payer-badge--rcpt' : ''}`}>
                                                                    {svcFromRecipient ? 'Rcpt' : 'Sndr'}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {o.companyServicePrice > 0 ? fmt(o.companyServicePrice) : <Dash />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#f97316', fontWeight: 600 }}>
                                                                {o.courierSalary != null ? fmt(o.courierSalary) : <Dash red />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {o.companyRevenue != null
                                                                    ? <span style={{ color: o.companyRevenue >= 0 ? '#10b981' : '#ef4444' }}>{fmt(o.companyRevenue)}</span>
                                                                    : <Dash red />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: svcFromRecipient ? 'var(--color-accent)' : 'var(--color-text-subtle)' }}>
                                                                {o.amountOfCashCollected != null ? fmt(o.amountOfCashCollected) : <Dash />}
                                                            </td>
                                                            <td style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                                                                {o.deliveredAt ? new Date(o.deliveredAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </fieldset>
                            )}

                            {preview.orders.length === 0 && (
                                <p style={{ textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.875rem', padding: '8px 0' }}>
                                    No delivered orders found for {date}.
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* ── Footer ─────────────────────────────────────────────────── */}
                <div className="modal__footer" style={{ padding: '16px 24px' }}>
                    <button type="button" className="modal__btn-cancel" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="modal__btn-submit"
                        onClick={handleSave}
                        disabled={saving || loading || !preview || hasIncomplete}
                        title={hasIncomplete ? 'Fix incomplete orders before saving' : undefined}
                        style={alreadyExists ? { background: '#6366f1' } : undefined}
                    >
                        {saving ? (
                            <><span className="btn__spinner" />{alreadyExists ? 'Updating…' : 'Saving…'}</>
                        ) : alreadyExists ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <path d="M2 8h10M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Update Settlement
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Save Settlement
                            </>
                        )}
                    </button>
                </div>
            </div>

            <style>{`
                .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
                .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22);animation:modal-slide-up 0.22s ease both; }
                .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
                .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
                .modal__title { font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.025em;color:var(--color-text);margin:0; }
                .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition); }
                .modal__close:hover { background:var(--color-border); }
                .modal__body { padding:20px 24px;display:flex;flex-direction:column;gap:16px; }
                .modal__fieldset { border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:14px 16px;margin:0; }
                .modal__legend { font-size:0.68rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--color-text-subtle);padding:0 6px; }
                .modal__global-error { display:flex;align-items:center;gap:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:#ef4444;font-size:0.825rem;padding:10px 14px; }
                .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid var(--color-border); }
                .modal__btn-cancel { padding:10px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer;transition:background var(--transition); }
                .modal__btn-cancel:hover:not(:disabled) { background:var(--color-bg-3); }
                .modal__btn-cancel:disabled { opacity:0.5;cursor:not-allowed; }
                .modal__btn-submit { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:var(--color-accent);border:none;border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;color:#fff;cursor:pointer;transition:background var(--transition); }
                .modal__btn-submit:hover:not(:disabled) { background:#d4891a; }
                .modal__btn-submit:disabled { opacity:0.6;cursor:not-allowed; }
                .btn__spinner { display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite; }
                .go-loading { display:flex;align-items:center;gap:10px;color:var(--color-text-subtle);font-size:0.875rem;padding:8px 0; }
                .go-spinner { width:16px;height:16px;border:2px solid var(--color-border);border-top-color:var(--color-accent);border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0; }
                @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
                @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 16px))} to{opacity:1;transform:translate(-50%,-50%)} }
                @keyframes spin { to{transform:rotate(360deg)} }

                .settlement-modal { width:min(820px,calc(100vw - 32px)); }
                .settlement-date-input { background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text);font-size:0.875rem;padding:8px 12px;outline:none;font-family:var(--font-body);transition:border-color var(--transition); }
                .settlement-date-input:focus { border-color:var(--color-accent); }
                .settlement-warning { display:flex;align-items:flex-start;gap:10px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:var(--radius-sm);color:#d97706;font-size:0.825rem;padding:10px 14px;line-height:1.5; }
                .settlement-warning svg { flex-shrink:0;margin-top:2px; }
                .settlement-orders-table { font-size:0.8rem; }
                .settlement-orders-table th { font-size:0.62rem; }

                /* Count cards */
                .stl-counts { display:flex;gap:12px; }
                .stl-count-card { flex:1;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:12px 16px;display:flex;flex-direction:column;gap:4px; }
                .stl-count-label { font-size:0.68rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-subtle); }
                .stl-count-value { font-size:1.5rem;font-weight:800;color:var(--color-text);font-family:var(--font-display); }

                /* Cash breakdown */
                .stl-cash-breakdown { display:flex;flex-direction:column;gap:10px; }
                .stl-cash-row { display:flex;align-items:center;justify-content:space-between;gap:12px; }
                .stl-cash-label { display:flex;align-items:center;gap:8px;font-size:0.82rem;color:var(--color-text);flex:1; }
                .stl-cash-hint { font-size:0.72rem;color:var(--color-text-subtle);font-style:italic; }
                .stl-cash-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0; }
                .stl-cash-dot--cod { background:#3b82f6; }
                .stl-cash-dot--svc { background:var(--color-accent); }
                .stl-cash-divider { height:1px;background:var(--color-border);margin:2px 0; }
                .stl-cash-row--total .stl-cash-label { font-size:0.875rem;font-weight:600; }
                .stl-cash-amount { font-size:0.9rem;font-weight:700;font-family:'Courier New',monospace;color:var(--color-text);flex-shrink:0; }
                .stl-cash-amount--total { font-size:1rem;color:var(--color-accent); }

                /* Summary grid */
                .stl-summary-grid { display:flex;flex-direction:column;gap:8px; }
                .stl-summary-row { display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--color-border); }
                .stl-summary-row:last-child { border-bottom:none; }
                .stl-summary-label { font-size:0.82rem;color:var(--color-text); }
                .stl-summary-hint { font-size:0.72rem;color:var(--color-text-subtle);font-style:italic;margin-left:6px; }
                .stl-summary-value { font-size:0.9rem;font-weight:700;font-family:'Courier New',monospace;flex-shrink:0; }

                /* Payer badge in orders table */
                .stl-payer-badge { display:inline-block;font-size:0.65rem;font-weight:700;border-radius:4px;padding:1px 6px;background:rgba(59,130,246,0.1);color:#3b82f6; }
                .stl-payer-badge--rcpt { background:rgba(196,127,23,0.12);color:var(--color-accent); }
            `}</style>
        </>,
        document.body
    );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Dash({ red = false }: { red?: boolean }) {
    return <span style={{ opacity: red ? 0.9 : 0.4, fontSize: '0.78rem', color: red ? '#ef4444' : undefined }}>—</span>;
}

function SummaryRow({ label, value, hint, color, bold }: {
    label: string; value: string; hint?: string; color?: string; bold?: boolean;
}) {
    return (
        <div className="stl-summary-row">
            <span className="stl-summary-label">
                {label}
                {hint && <span className="stl-summary-hint">{hint}</span>}
            </span>
            <span className="stl-summary-value" style={{ color: color ?? 'var(--color-text)', fontWeight: bold ? 800 : 700 }}>
                {value}
            </span>
        </div>
    );
}
