import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    fetchSettlementPreview,
    createSettlement,
    updateSettlement,
    SettlementApiError,
} from '../../api/settlements';
import type { SettlementPreview } from '../../api/settlements';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';

interface Props {
    open: boolean;
    onClose: () => void;
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
    const [date,          setDate]          = useState(initialDate ?? todayIso());
    const [preview,       setPreview]       = useState<SettlementPreview | null>(null);
    const [loading,       setLoading]       = useState(false);
    const [saving,        setSaving]        = useState(false);
    const [error,         setError]         = useState<string | null>(null);
    const [alreadyExists, setAlreadyExists] = useState(false);
    const [amountPaid,    setAmountPaid]    = useState('0.00');

    const loadPreview = useCallback(async (d: string) => {
        setLoading(true);
        setError(null);
        setPreview(null);
        setAlreadyExists(false);
        try {
            const data = await fetchSettlementPreview(courierId, d, token);
            setPreview(data);
            setAlreadyExists(!!data.existingSettlementId);
            // Pre-fill the input with the remaining outstanding balance (salary − already paid).
            const alreadyPaid = data.existingAmountCourierWasPaid ?? 0;
            const outstanding = Math.max(0, data.totalCourierSalary - alreadyPaid);
            setAmountPaid(outstanding.toFixed(2));
        } catch (err) {
            setError(err instanceof SettlementApiError ? err.message : 'Failed to load preview.');
        } finally {
            setLoading(false);
        }
    }, [courierId, token]);

    useEffect(() => {
        // Each time the modal opens, start on the caller's chosen date (the date the
        // admin filtered couriers by) so the preview matches the list they picked from.
        if (open) {
            const start = initialDate ?? todayIso();
            setDate(start);
            loadPreview(start);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    const handleDateChange = (d: string) => { setDate(d); loadPreview(d); };

    const paidNum   = parseFloat(amountPaid);
    const paidValid = !isNaN(paidNum) && paidNum >= 0;

    const handleSave = async () => {
        if (!preview || !paidValid) return;
        setSaving(true);
        setError(null);
        try {
            const payload = { courierId, date, partialAmountPaid: paidNum };
            if (alreadyExists) {
                await updateSettlement(payload, token);
            } else {
                await createSettlement(payload, token);
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
    const paidExceedsSalary = !!preview && paidValid &&
        (preview.existingAmountCourierWasPaid ?? 0) + paidNum > preview.totalCourierSalary;
    // When the salary is larger than the cash the courier is holding, the company
    // must pay the courier the difference out of pocket. Zero when the courier
    // held enough cash to cover their own salary.
    const cashShortfall = preview
        ? Math.max(0, preview.totalCourierSalary - preview.totalCashCourierHolds)
        : 0;
    // "Transfer to company" = the cash the courier holds minus their FULL salary for the
    // day. The salary is paid in two parts: what was already paid in an earlier settle of
    // the same day (existingAmountCourierWasPaid) plus what is being paid now (the input).
    // Subtracting both keeps the courier's whole salary deducted exactly once, so a
    // re-settle doesn't drop the already-paid portion. Negative ⇒ the company owes the courier.
    const effectivePaid = paidValid ? paidNum : 0;
    const salaryAlreadyPaid = preview?.existingAmountCourierWasPaid ?? 0;
    const liveTransferToCompany = preview
        ? preview.totalCashCourierHolds - (salaryAlreadyPaid + effectivePaid)
        : 0;

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
                            <button
                                type="button"
                                className="stl-date-arrow"
                                onClick={() => handleDateChange(stepDay(date, -1))}
                                aria-label="Previous day"
                            >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
                                className="stl-date-arrow"
                                onClick={() => handleDateChange(stepDay(date, 1))}
                                disabled={date >= todayIso()}
                                aria-label="Next day"
                            >
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
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
                                <strong>{t.stlmWarning(preview!.incompleteOrderTrackingNumbers.length)}</strong>
                                {' '}{preview!.incompleteOrderTrackingNumbers.join(', ')}. {t.stlmWarningHint}
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="go-loading">
                            <div className="go-spinner" />
                            {t.stlmLoadingDate(date)}
                        </div>
                    )}

                    {!loading && preview && (
                        <>
                            {/* ── Order counts ─────────────────────────────── */}
                            <div className="stl-counts">
                                <div className="stl-count-card">
                                    <span className="stl-count-label">{t.stlmPickedUp}</span>
                                    <span className="stl-count-value">{preview.totalOrdersPickedUp}</span>
                                </div>
                                <div className="stl-count-card">
                                    <span className="stl-count-label">{t.stlmDelivered}</span>
                                    <span className="stl-count-value">{preview.totalOrdersDelivered}</span>
                                </div>
                            </div>

                            {/* ── Cash breakdown ───────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.stlmCashBreakdown}</legend>
                                <div className="stl-cash-breakdown">
                                    <div className="stl-cash-row">
                                        <div className="stl-cash-label">
                                            <span className="stl-cash-dot stl-cash-dot--cod" />
                                            <span>{t.stlmCodLabel}</span>
                                        </div>
                                        <span className="stl-cash-amount">{fmt(preview.totalCodOnlyAmount)}</span>
                                    </div>
                                    <div className="stl-cash-row">
                                        <div className="stl-cash-label">
                                            <span className="stl-cash-dot stl-cash-dot--svc" />
                                            <span>{t.stlmSvcFeeLabel}</span>
                                        </div>
                                        <span className="stl-cash-amount">{fmt(preview.totalServiceFeesCollectedFromRecipients)}</span>
                                    </div>
                                    <div className="stl-cash-divider" />
                                    <div className="stl-cash-row stl-cash-row--total">
                                        <div className="stl-cash-label">
                                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.6 }}>
                                                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                                                <path d="M5 8h6M8 5v6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                            </svg>
                                            <span>{t.stlmTotalCash}</span>
                                        </div>
                                        <span className="stl-cash-amount stl-cash-amount--total">{fmt(preview.totalCashCourierHolds)}</span>
                                    </div>
                                </div>
                            </fieldset>

                            {/* ── Financial summary ─────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.stlmFinancialSummary}</legend>
                                <div className="stl-fin-rows">
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">
                                            {t.stlmTotalSvcRevenue}
                                            <span className="stl-fin-hint">{t.stlmTotalSvcHint}</span>
                                        </span>
                                        <span className="stl-fin-value">{fmt(preview.totalCompanyServiceRevenue)}</span>
                                    </div>
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmCourierSalary}</span>
                                        <span className="stl-fin-value stl-fin-value--salary">{fmt(preview.totalCourierSalary)}</span>
                                    </div>
                                    <div className="stl-fin-divider" />
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">{t.stlmNetIncome}</span>
                                        <span className="stl-fin-value stl-fin-value--income">{fmt(preview.totalCompanyNetIncome)}</span>
                                    </div>
                                    {liveTransferToCompany >= 0 ? (
                                        <div className="stl-fin-row">
                                            <span className="stl-fin-label">
                                                {t.stlmCourierToCompany}
                                                <span className="stl-fin-hint">{t.stlmCourierToCompanyHint}</span>
                                            </span>
                                            <span className="stl-fin-value stl-fin-value--transfer">{fmt(liveTransferToCompany)}</span>
                                        </div>
                                    ) : (
                                        <div className="stl-fin-row">
                                            <span className="stl-fin-label">
                                                {t.stlmCompanyToCourier}
                                                <span className="stl-fin-hint">{t.stlmCompanyToCourierHint}</span>
                                            </span>
                                            <span className="stl-fin-value" style={{ color: '#6366f1' }}>{fmt(Math.abs(liveTransferToCompany))}</span>
                                        </div>
                                    )}
                                </div>
                            </fieldset>

                            {/* ── Courier payment ──────────────────────────── */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.stlmCourierPayment}</legend>
                                <div className="stl-fin-rows">
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">
                                            {t.stlmSalaryEarned}
                                            <span className="stl-fin-hint">{t.stlmSalaryEarnedHint}</span>
                                        </span>
                                        <span className="stl-fin-value stl-fin-value--salary">{fmt(preview.totalCourierSalary)}</span>
                                    </div>
                                    <div className="stl-fin-row">
                                        <span className="stl-fin-label">
                                            {t.stlmCashHeld}
                                            <span className="stl-fin-hint">{t.stlmCashHeldHint}</span>
                                        </span>
                                        <span className="stl-fin-value">{fmt(preview.totalCashCourierHolds)}</span>
                                    </div>
                                    {cashShortfall > 0 ? (
                                        <div className="stl-fin-row">
                                            <span className="stl-fin-label">
                                                {t.stlmShortfall}
                                                <span className="stl-fin-hint">
                                                    {t.stlmShortfallHint(fmt(preview.totalCourierSalary), fmt(preview.totalCashCourierHolds))}
                                                </span>
                                            </span>
                                            <span className="stl-fin-value" style={{ color: '#6366f1', fontWeight: 700 }}>{fmt(cashShortfall)}</span>
                                        </div>
                                    ) : (
                                        <div className="stl-fin-row">
                                            <span className="stl-fin-label">
                                                {t.stlmCoveredByCash}
                                                <span className="stl-fin-hint">{t.stlmCoveredByCashHint}</span>
                                            </span>
                                            <span className="stl-fin-value stl-fin-value--income">{fmt(preview.existingAmountCourierWasPaid ?? 0)}</span>
                                        </div>
                                    )}
                                    <div className="stl-fin-divider" />
                                    <div className="stl-pay-input-row">
                                        <label htmlFor="stl-amount-paid" className="stl-fin-label">
                                            {t.stlmAmountPaid}
                                            <span className="stl-fin-hint">{t.stlmAmountPaidHint}</span>
                                        </label>
                                        <div className="stl-pay-input-wrap" data-invalid={!paidValid}>
                                            <span className="stl-pay-currency">₾</span>
                                            <input
                                                id="stl-amount-paid"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                inputMode="decimal"
                                                className="stl-pay-input"
                                                value={amountPaid}
                                                onChange={e => setAmountPaid(e.target.value)}
                                                aria-invalid={!paidValid}
                                            />
                                        </div>
                                    </div>
                                    {!paidValid && (
                                        <div className="stl-pay-note stl-pay-note--err">{t.stlmErrInvalidAmount}</div>
                                    )}
                                    {paidExceedsSalary && (
                                        <div className="stl-pay-note stl-pay-note--warn">
                                            {t.stlmWarnExceedsSalary(fmt(preview.totalCourierSalary))}
                                        </div>
                                    )}
                                </div>
                            </fieldset>

                            {/* ── Orders table ─────────────────────────────── */}
                            {preview.orders.length > 0 && (
                                <fieldset className="modal__fieldset">
                                    <legend className="modal__legend">
                                        {t.stlmDeliveredOrders(preview.orders.length)}
                                    </legend>
                                    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                                        <table className="go-orders-table settlement-orders-table">
                                            <thead>
                                                <tr>
                                                    <th>{t.stlmThTracking}</th>
                                                    <th>{t.stlmThRecipient}</th>
                                                    <th>{t.stlmThCity}</th>
                                                    <th>{t.stlmThPayer}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThSvc}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThSalary}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThRevenue}</th>
                                                    <th style={{ textAlign: 'right' }}>{t.stlmThCod}</th>
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
                                                            <td style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</td>
                                                            <td style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>{o.recipientCity}</td>
                                                            <td>
                                                                <span className={`stl-payer-badge stl-payer-badge--${o.whoPaysForCompanyService.toLowerCase()}`}>
                                                                    {o.whoPaysForCompanyService === 'Recipient' ? t.stlmRcpt : t.stlmSndr}
                                                                </span>
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
                                    {t.stlmNoOrders(date)}
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
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        className="modal__btn-submit"
                        onClick={handleSave}
                        disabled={saving || loading || !preview || hasIncomplete || !paidValid}
                        title={
                            hasIncomplete ? t.stlmFixHint
                            : !paidValid ? t.stlmErrAmountTitle
                            : undefined
                        }
                    >
                        {saving ? (
                            <><span className="btn__spinner" />{alreadyExists ? t.stlmUpdating : t.stlmSaving}</>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                    <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {alreadyExists ? t.stlmUpdateBtn : t.stlmSaveBtn}
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

                .settlement-modal { width:min(820px,calc(100vw - 32px)); }
                .stl-date-nav { display:flex;align-items:center;gap:6px; }
                .stl-date-arrow { display:flex;align-items:center;justify-content:center;width:30px;height:34px;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition),color var(--transition),border-color var(--transition);flex-shrink:0; }
                .stl-date-arrow:hover:not(:disabled) { background:var(--color-border);color:var(--color-text); }
                .stl-date-arrow:disabled { opacity:0.35;cursor:not-allowed; }
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
                .stl-cash-label { display:flex;align-items:center;gap:8px;font-size:0.875rem;color:var(--color-text-subtle); }
                .stl-cash-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0; }
                .stl-cash-dot--cod { background:#c47f17; }
                .stl-cash-dot--svc { background:#f97316; }
                .stl-cash-amount { font-size:0.9rem;font-weight:600;color:var(--color-text);font-family:'Courier New',monospace; }
                .stl-cash-divider { border:none;border-top:1px solid var(--color-border);margin:2px 0; }
                .stl-cash-row--total .stl-cash-label { color:var(--color-text);font-weight:600; }
                .stl-cash-amount--total { font-size:1rem;font-weight:700;color:var(--color-text); }

                /* Financial summary */
                .stl-fin-rows { display:flex;flex-direction:column;gap:10px; }
                .stl-fin-row { display:flex;align-items:baseline;justify-content:space-between;gap:12px; }
                .stl-fin-label { font-size:0.875rem;color:var(--color-text-subtle);display:flex;flex-direction:column;gap:2px; }
                .stl-fin-hint { font-size:0.72rem;color:var(--color-text-subtle);opacity:0.65; }
                .stl-fin-value { font-size:0.9rem;font-weight:600;color:var(--color-text);font-family:'Courier New',monospace;white-space:nowrap; }
                .stl-fin-value--salary { color:#f97316; }
                .stl-fin-value--income { color:#10b981; }
                .stl-fin-value--transfer { color:var(--color-accent); }
                .stl-fin-divider { border:none;border-top:1px solid var(--color-border);margin:2px 0; }

                /* Courier payment input */
                .stl-pay-input-row { display:flex;align-items:center;justify-content:space-between;gap:12px; }
                .stl-pay-input-wrap { display:inline-flex;align-items:center;gap:4px;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:0 10px;transition:border-color var(--transition); }
                .stl-pay-input-wrap:focus-within { border-color:var(--color-accent); }
                .stl-pay-input-wrap[data-invalid="true"] { border-color:#ef4444; }
                .stl-pay-currency { color:var(--color-text-subtle);font-size:0.9rem;font-family:'Courier New',monospace; }
                .stl-pay-input { width:110px;background:transparent;border:none;outline:none;color:var(--color-text);font-size:0.95rem;font-weight:600;font-family:'Courier New',monospace;padding:8px 0;text-align:right; }
                .stl-pay-note { font-size:0.78rem;line-height:1.4; }
                .stl-pay-note--err { color:#ef4444; }
                .stl-pay-note--warn { color:#d97706; }

                /* Payer badge */
                .stl-payer-badge { display:inline-block;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:4px;letter-spacing:0.04em; }
                .stl-payer-badge--recipient { background:rgba(196,127,23,0.12);color:#c47f17; }
                .stl-payer-badge--sender { background:rgba(99,102,241,0.1);color:#818cf8; }
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
