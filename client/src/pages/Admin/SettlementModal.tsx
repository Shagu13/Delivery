import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchSettlementPreview,
    createSettlement,
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

interface Totals {
    totalOrdersPickedUp: string;
    totalOrdersDelivered: string;
    totalAmountOfCashCollected: string;
    totalCompanyServiceRevenue: string;
    totalCourierSalary: string;
    totalCompanyNetIncome: string;
}

function todayIso(): string {
    const d = new Date();
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
}

function offsetDate(iso: string, days: number): string {
    const [y, m, day] = iso.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    d.setDate(d.getDate() + days);
    return [
        d.getFullYear(),
        String(d.getMonth() + 1).padStart(2, '0'),
        String(d.getDate()).padStart(2, '0'),
    ].join('-');
}

function toTotals(p: SettlementPreview): Totals {
    return {
        totalOrdersPickedUp:        String(p.totalOrdersPickedUp),
        totalOrdersDelivered:       String(p.totalOrdersDelivered),
        totalAmountOfCashCollected: p.totalAmountOfCashCollected > 0
            ? p.totalAmountOfCashCollected.toFixed(2)
            : '',
        totalCompanyServiceRevenue: p.totalCompanyServiceRevenue.toFixed(2),
        totalCourierSalary:         p.totalCourierSalary.toFixed(2),
        totalCompanyNetIncome:      p.totalCompanyNetIncome.toFixed(2),
    };
}

export function SettlementModal({
    open,
    onClose,
    onCreated,
    courierId,
    courierFullName,
    token,
}: Props) {
    const [date,     setDate]     = useState(todayIso());
    const [preview,  setPreview]  = useState<SettlementPreview | null>(null);
    const [totals,   setTotals]   = useState<Totals | null>(null);
    const [loading,  setLoading]  = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [error,    setError]    = useState<string | null>(null);

    // ── Fetch preview whenever date changes ───────────────────────────────────
    const loadPreview = useCallback(async (d: string) => {
        setLoading(true);
        setError(null);
        setPreview(null);
        setTotals(null);
        try {
            const data = await fetchSettlementPreview(courierId, d, token);
            setPreview(data);
            setTotals(toTotals(data));
        } catch (err) {
            setError(err instanceof SettlementApiError ? err.message : 'Failed to load preview.');
        } finally {
            setLoading(false);
        }
    }, [courierId, token]);

    useEffect(() => {
        if (open) {
            const today = todayIso();
            setDate(today);
            loadPreview(today);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Close on Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const handleDateChange = (d: string) => {
        setDate(d);
        loadPreview(d);
    };

    const stepDate = (direction: -1 | 1) => {
        const next = offsetDate(date, direction);
        if (next > todayIso()) return;
        handleDateChange(next);
    };

    const handleTotalChange = (field: keyof Totals, value: string) => {
        setTotals(prev => prev ? { ...prev, [field]: value } : prev);
    };

    const handleSave = async () => {
        if (!totals || !preview) return;
        setSaving(true);
        setError(null);
        try {
            await createSettlement({
                courierId,
                date,
            }, token);
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
                    {/* ── Date navigator ───────────────────────────────────── */}
                    <fieldset className="modal__fieldset">
                        <legend className="modal__legend">Settlement Date</legend>
                        <div className="date-nav">
                            <button
                                type="button"
                                className="date-nav__arrow"
                                onClick={() => stepDate(-1)}
                                disabled={loading || saving}
                                aria-label="Previous day"
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                            <input
                                type="date"
                                value={date}
                                max={todayIso()}
                                onChange={e => handleDateChange(e.target.value)}
                                className="settlement-date-input"
                            />
                            <button
                                type="button"
                                className="date-nav__arrow"
                                onClick={() => stepDate(1)}
                                disabled={loading || saving || date >= todayIso()}
                                aria-label="Next day"
                            >
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                    </fieldset>

                    {/* ── Error banner ─────────────────────────────────────── */}
                    {error && (
                        <div className="modal__global-error" role="alert">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* ── Incomplete orders warning ─────────────────────────── */}
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

                    {!loading && preview && totals && (
                        <>
                            {/* ── Editable totals ──────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Settlement Totals — editable</legend>
                                <div className="settlement-grid">
                                    <SettlementField
                                        label="Packages Picked Up"
                                        hint="Sum of GroupOrder.NumberOfPackages"
                                        type="number"
                                        value={totals.totalOrdersPickedUp}
                                        onChange={v => handleTotalChange('totalOrdersPickedUp', v)}
                                    />
                                    <SettlementField
                                        label="Orders Delivered"
                                        hint="Count of DeliveredToRecipient orders"
                                        type="number"
                                        value={totals.totalOrdersDelivered}
                                        onChange={v => handleTotalChange('totalOrdersDelivered', v)}
                                    />
                                    <SettlementField
                                        label="Cash Collected (₾)"
                                        hint="Leave blank if no COD orders"
                                        type="number"
                                        value={totals.totalAmountOfCashCollected}
                                        onChange={v => handleTotalChange('totalAmountOfCashCollected', v)}
                                        placeholder="0.00"
                                    />
                                    <SettlementField
                                        label="Service Revenue (₾)"
                                        hint="Sum of CompanyServicePrice"
                                        type="number"
                                        value={totals.totalCompanyServiceRevenue}
                                        onChange={v => handleTotalChange('totalCompanyServiceRevenue', v)}
                                    />
                                    <SettlementField
                                        label="Courier Salary (₾)"
                                        hint="Sum of CourierSalary"
                                        type="number"
                                        value={totals.totalCourierSalary}
                                        onChange={v => handleTotalChange('totalCourierSalary', v)}
                                    />
                                    <SettlementField
                                        label="Company Net Income (₾)"
                                        hint="Revenue − Salary"
                                        type="number"
                                        value={totals.totalCompanyNetIncome}
                                        onChange={v => handleTotalChange('totalCompanyNetIncome', v)}
                                    />
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
                                                    <th style={{ textAlign: 'right' }}>Service ₾</th>
                                                    <th style={{ textAlign: 'right' }}>Salary ₾</th>
                                                    <th style={{ textAlign: 'right' }}>Revenue ₾</th>
                                                    <th style={{ textAlign: 'right' }}>Cash ₾</th>
                                                    <th>Delivered</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.orders.map(o => {
                                                    const incomplete =
                                                        !o.courierSalary || o.courierSalary <= 0 ||
                                                        o.companyServicePrice <= 0 ||
                                                        o.companyRevenue == null;
                                                    return (
                                                        <tr key={o.id} style={incomplete ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                                                            <td>
                                                                <span className="tn-badge">{o.trackingNumber}</span>
                                                                {incomplete && (
                                                                    <span style={{ marginLeft: 6, color: '#ef4444', fontSize: '0.7rem', fontWeight: 700 }}>⚠</span>
                                                                )}
                                                            </td>
                                                            <td style={{ fontWeight: 600 }}>{o.recipientName}</td>
                                                            <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>
                                                                {o.recipientCity}<br />
                                                                <span style={{ fontSize: '0.72rem' }}>{o.recipientDistrict}</span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {o.companyServicePrice > 0 ? `₾${o.companyServicePrice.toFixed(2)}` : <Dash />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: '#f97316', fontWeight: 600 }}>
                                                                {o.courierSalary != null ? `₾${o.courierSalary.toFixed(2)}` : <Dash red />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {o.companyRevenue != null
                                                                    ? <span style={{ color: o.companyRevenue >= 0 ? '#10b981' : '#ef4444' }}>₾{o.companyRevenue.toFixed(2)}</span>
                                                                    : <Dash red />}
                                                            </td>
                                                            <td style={{ textAlign: 'right', color: 'var(--color-text-subtle)' }}>
                                                                {o.amountOfCashCollected != null ? `₾${o.amountOfCashCollected.toFixed(2)}` : <Dash />}
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
                    <button
                        type="button"
                        className="modal__btn-cancel"
                        onClick={onClose}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="modal__btn-submit"
                        onClick={handleSave}
                        disabled={saving || loading || !preview || hasIncomplete}
                        title={hasIncomplete ? 'Fix incomplete orders before saving' : undefined}
                    >
                        {saving ? (
                            <><span className="btn__spinner" />Saving…</>
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
                .modal__btn-cancel:disabled { opacity:0.5;cursor:not-allowed; }
                .modal__btn-submit { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:var(--color-accent);border:none;border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:#fff;cursor:pointer;transition:background var(--transition),box-shadow var(--transition); }
                .modal__btn-submit:hover:not(:disabled) { background:#d4891a;box-shadow:0 4px 16px rgba(196,127,23,0.28); }
                .modal__btn-submit:disabled { opacity:0.6;cursor:not-allowed; }
                .btn__spinner { display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite; }
                .go-loading { display:flex;align-items:center;gap:10px;color:var(--color-text-subtle);font-size:0.875rem;padding:8px 0; }
                .go-spinner { width:16px;height:16px;border:2px solid var(--color-border);border-top-color:var(--color-accent);border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0; }
                @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
                @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 16px))} to{opacity:1;transform:translate(-50%,-50%)} }
                @keyframes spin { to{transform:rotate(360deg)} }
                .settlement-modal {
                    width: min(780px, calc(100vw - 32px));
                }
                .date-nav {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .date-nav__arrow {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    background: var(--color-bg-3);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text-muted);
                    cursor: pointer;
                    flex-shrink: 0;
                    transition: background var(--transition), color var(--transition), border-color var(--transition);
                }
                .date-nav__arrow:hover:not(:disabled) {
                    background: var(--color-border);
                    color: var(--color-accent);
                    border-color: var(--color-accent);
                }
                .date-nav__arrow:disabled {
                    opacity: 0.35;
                    cursor: not-allowed;
                }
                .settlement-date-input {
                    background: var(--color-bg-3);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    font-size: 0.875rem;
                    padding: 8px 12px;
                    outline: none;
                    transition: border-color var(--transition);
                    font-family: var(--font-body);
                }
                .settlement-date-input:focus {
                    border-color: var(--color-accent);
                }
                .settlement-warning {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    background: rgba(251,191,36,0.1);
                    border: 1px solid rgba(251,191,36,0.3);
                    border-radius: var(--radius-sm);
                    color: #d97706;
                    font-size: 0.825rem;
                    padding: 10px 14px;
                    line-height: 1.5;
                }
                .settlement-warning svg { flex-shrink: 0; margin-top: 2px; }
                .settlement-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 12px;
                }
                @media (max-width: 560px) {
                    .settlement-grid { grid-template-columns: 1fr 1fr; }
                }
                .settlement-field { display: flex; flex-direction: column; gap: 4px; }
                .settlement-field__label {
                    font-size: 0.68rem;
                    font-weight: 700;
                    letter-spacing: 0.07em;
                    text-transform: uppercase;
                    color: var(--color-text-subtle);
                }
                .settlement-field__hint {
                    font-size: 0.65rem;
                    color: var(--color-text-subtle);
                    opacity: 0.7;
                    margin-bottom: 2px;
                }
                .settlement-field__input {
                    background: var(--color-bg);
                    border: 1px solid var(--color-border);
                    border-radius: var(--radius-sm);
                    color: var(--color-text);
                    font-size: 0.9rem;
                    font-weight: 600;
                    font-family: 'Courier New', monospace;
                    padding: 8px 10px;
                    outline: none;
                    transition: border-color var(--transition);
                    width: 100%;
                    box-sizing: border-box;
                }
                .settlement-field__input:focus {
                    border-color: var(--color-accent);
                }
                .settlement-orders-table { font-size: 0.8rem; }
                .settlement-orders-table th { font-size: 0.62rem; }
            `}</style>
        </>,
        document.body
    );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Dash({ red = false }: { red?: boolean }) {
    return (
        <span style={{ opacity: red ? 0.9 : 0.4, fontSize: '0.78rem', color: red ? '#ef4444' : undefined }}>—</span>
    );
}

function SettlementField({
    label,
    hint,
    type,
    value,
    onChange,
    placeholder = '',
}: {
    label: string;
    hint: string;
    type: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="settlement-field">
            <span className="settlement-field__label">{label}</span>
            <span className="settlement-field__hint">{hint}</span>
            <input
                className="settlement-field__input"
                type={type}
                min="0"
                step="0.01"
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
            />
        </div>
    );
}
