import { Fragment, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { usePlaceLocalizer } from '../../utils/usePlaceLocalizer';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { fetchMyOrderFinance, fetchMyPaymentReceipts, downloadMyOrderFinanceExcel, downloadMyOrderFinanceInvoiceExcel } from '../../api/orderFinance';
import type { OrderFinanceLine, PaymentReceipt } from '../../api/orderFinance';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { round2, isCancelledNonBillable, serviceOutstanding, codOutstanding } from '../../utils/orderFinanceOutstanding';
import '../../styles/dashboard.css';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// Last-mile statuses between warehouse acceptance and delivery (mirrors the backend's
// OrderFinanceQueries.ActiveLastMileStatuses) — an order in one of these is "accepted in
// warehouse" and its COD is expected, but not yet collected.
const ACTIVE_LAST_MILE_STATUSES = new Set([
    'AdminAcceptedOrderInWareHouse',
    'OrderIsOnItsWayToRecipientsCity',
    'CourierAssignedToDeliver',
    'CourierDeliveringTheOrderToRecipient',
    'DeliveryPostponed',
]);
/** Expected COD for an order accepted in warehouse but not yet delivered — nothing collected
 *  yet, so this is a forecast, not an outstanding balance. */
const codExpected = (o: OrderFinanceLine) =>
    (!o.deliveredAt && ACTIVE_LAST_MILE_STATUSES.has(o.status)) ? round2(Math.max(0, o.codAmount ?? 0)) : 0;

/** Format a Date as a local "YYYY-MM-DD" string (matches the date-input value). */
const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Segmented toggle control (a tab selector, not a ghost button) — kept inline as a
// small bespoke control. Day-nav buttons use the shared `.btn-ghost btn-ghost--sm`.
const segWrap: React.CSSProperties = {
    display: 'inline-flex', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: 'var(--color-bg)',
};
const segBtn = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5, border: 'none', cursor: 'pointer',
    background: active ? 'var(--color-accent-dim)' : 'transparent',
    color: active ? 'var(--color-accent)' : 'var(--color-text-subtle)',
    fontSize: '0.8rem', fontWeight: active ? 700 : 500, padding: '7px 16px',
    whiteSpace: 'nowrap', transition: 'background .15s, color .15s',
});
const fDateInput: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem',
    padding: '6px 10px', outline: 'none',
};

function Badge({ text, tone }: { text: string; tone: 'paid' | 'unpaid' | 'muted' }) {
    const palette = {
        paid:   { bg: 'rgba(5,150,105,0.12)',  fg: '#059669' },
        unpaid: { bg: 'rgba(180,83,9,0.12)',   fg: '#b45309' },
        muted:  { bg: 'var(--color-bg-3)',     fg: 'var(--color-text-subtle)' },
    }[tone];
    return (
        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100, background: palette.bg, color: palette.fg, whiteSpace: 'nowrap' }}>
            {text}
        </span>
    );
}

// ── Excel-style grid cell styles ──────────────────────────────────────────────────
const cell: React.CSSProperties = {
    border: '1px solid var(--color-border)',
    padding: '7px 10px',
    fontSize: '0.8rem',
    color: 'var(--color-text)',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap',
};
const headCell: React.CSSProperties = {
    ...cell,
    background: 'var(--color-bg-2)',
    color: 'var(--color-text-subtle)',
    fontWeight: 700,
    fontSize: '0.68rem',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    textAlign: 'left',
    position: 'sticky',
    top: 0,
};

function OrderTableRow({ line, index }: { line: OrderFinanceLine; index: number }) {
    const { t, lang } = useLanguage();
    const { locCity, locDistrict } = usePlaceLocalizer();
    // Localized order-type label (Send / Return / Exchange).
    const orderTypeLabel = line.orderType === 'Return' ? t.aopOrderTypeReturn
        : line.orderType === 'Exchange' ? t.aopOrderTypeExchange
        : t.aopOrderTypeSend;
    const place = [locCity(line.recipientCity), locDistrict(line.recipientDistrict)].filter(Boolean).join(', ');
    // Cancelled (non-billable) orders are listed for transparency but owe/collect nothing → "—".
    const cancelledNonBillable = isCancelledNonBillable(line);
    // A failed delivery or any cancelled order collected no COD, so nothing is owed back.
    const cod = (line.isBillableFailedDelivery || cancelledNonBillable) ? 0 : (line.codAmount ?? 0);
    // Use the server's computed truth: a failed delivery shifts the fee to the sender even when
    // the order was originally recipient-pays. A non-billable cancellation owes nothing.
    const isSenderPays = line.senderOwesService && !cancelledNonBillable;
    const servicePaid = line.companyServicePaymentStatus === 'Paid';
    // COD is only owed back to the customer when there is a package amount to collect.
    // Orders with no COD (codAmount null/0) have nothing to pay back → no paid/unpaid label.
    const hasCod = cod > 0.005;
    const statusMeta = getStatusMeta(line.status, lang);
    const [statusBg, statusFg] = STATUS_COLORS[line.status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)'];
    // Short payment date shown under the paid badge (no separate column).
    const fmtPaidDate = (iso: string) =>
        new Date(iso).toLocaleDateString(lang === 'ka' ? 'ka-GE' : 'en-US',
            { year: 'numeric', month: 'short', day: 'numeric' });
    const paidDateStyle: React.CSSProperties = { fontSize: '0.66rem', color: 'var(--color-text-subtle)', marginTop: 2 };

    return (
        <tr style={{ background: index % 2 ? 'var(--color-bg)' : 'var(--color-bg-2)' }}>
            <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{index + 1}</td>
            <td style={{ ...cell, fontWeight: 700 }}>{line.trackingNumber}</td>
            <td style={cell}>
                <div>{recipientDisplayName(line.recipientName, t.recipientUnknown)}</div>
                {place && <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.72rem' }}>{place}</div>}
                {line.recipientAddress && (
                    <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.72rem' }}>{line.recipientAddress}</div>
                )}
            </td>
            <td style={cell}>{orderTypeLabel}</td>
            <td style={cell}>
                <span title={statusMeta.description} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: statusBg, color: statusFg }}>
                    {statusMeta.short}
                </span>
                {/* Cancelled / failed: show the reason in red so it's clearly visible. */}
                {line.cancellationReason && (
                    <div style={{ marginTop: 3, fontSize: '0.66rem', fontWeight: 600, color: '#dc2626' }}>
                        {t.cdCancelReasons[line.cancellationReason]}
                        {line.cancellationReason === 'Other' && line.cancellationComment ? `: ${line.cancellationComment}` : ''}
                    </div>
                )}
            </td>
            {/* COD — company owes customer. "—" for cancelled/failed (nothing collected).
                Not-yet-delivered orders (accepted in warehouse) show the expected amount with
                a "Pending" badge instead of "Unpaid" — nothing has been collected yet, so it
                isn't owed back yet either. */}
            <td style={{ ...cell, textAlign: 'right' }}>
                {(line.isBillableFailedDelivery || cancelledNonBillable) ? (
                    <span style={{ color: 'var(--color-text-subtle)' }}>—</span>
                ) : !line.deliveredAt ? (
                    hasCod ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontWeight: 700 }}>{gel(cod)}</span>
                            <Badge text={t.ofinCodPending} tone="muted" />
                        </div>
                    ) : <span style={{ color: 'var(--color-text-subtle)' }}>—</span>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontWeight: 700 }}>{gel(cod)}</span>
                            {line.isCollectedCodPaidToCustomer
                                ? <Badge text={t.ofinPaid} tone="paid" />
                                : hasCod && <Badge text={t.ofinUnpaid} tone="unpaid" />}
                        </div>
                        {hasCod && (line.codPaidToCustomerAmount ?? 0) > 0.005 && (
                            <div style={paidDateStyle}>
                                {t.ofinPaid} {gel(line.codPaidToCustomerAmount ?? 0)}
                                {line.codPaidToCustomerAt ? ` · ${fmtPaidDate(line.codPaidToCustomerAt)}` : ''}
                            </div>
                        )}
                    </>
                )}
            </td>
            {/* Service fee — "—" for a non-billable cancellation (nothing owed). */}
            <td style={{ ...cell, textAlign: 'right' }}>
                {cancelledNonBillable ? (
                    <span style={{ color: 'var(--color-text-subtle)' }}>—</span>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                            <span style={{ fontWeight: 700 }}>{gel(line.companyServicePrice)}</span>
                            {isSenderPays
                                ? <Badge text={servicePaid ? t.ofinPaid : t.ofinUnpaid} tone={servicePaid ? 'paid' : 'unpaid'} />
                                : <Badge text={t.ofinRecipientPays} tone="muted" />}
                        </div>
                        {isSenderPays && (line.servicePaidByCustomerAmount ?? 0) > 0.005 && (
                            <div style={paidDateStyle}>
                                {t.ofinPaid} {gel(line.servicePaidByCustomerAmount ?? 0)}
                                {line.servicePaidByCustomerAt ? ` · ${fmtPaidDate(line.servicePaidByCustomerAt)}` : ''}
                            </div>
                        )}
                    </>
                )}
            </td>
        </tr>
    );
}

export function CustomerFinancePage() {
    const { token } = useAuth();
    const { t, lang } = useLanguage();
    // Render a YYYY-MM-DD value as a localized, human-readable date (with weekday).
    const readableDate = (s: string) =>
        new Date(s + 'T00:00:00').toLocaleDateString(lang === 'ka' ? 'ka-GE' : 'en-US',
            { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    // 'placed' dates by delivery, falling back to placement while undelivered — same
    // rule as the admin Finance page, so a given date/range shows the same orders on
    // both. 'payments' filters by the COD-payment date (CodPaidToCustomerAt) — only
    // orders whose COD was paid out are shown; 'receipts' shows the immutable payment
    // history (PaymentReceipt) by the date it was paid.
    const [mode, setMode] = useState<'placed' | 'payments' | 'receipts'>('placed');
    // Date granularity: a single Day, a whole Month, or an inclusive custom Range.
    const [dateMode, setDateMode] = useState<'day' | 'month' | 'range'>('day');
    const [date, setDate] = useState(toDateStr(new Date()));   // day/month: a day in the period ('' = all dates)
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    // Recipient-location narrowing, applied client-side over the loaded orders.
    const [city, setCity] = useState('');
    const [district, setDistrict] = useState('');
    const [address, setAddress] = useState('');
    const [items, setItems] = useState<OrderFinanceLine[]>([]);
    const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
    const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [invoiceExporting, setInvoiceExporting] = useState(false);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        const opts = dateMode === 'range'
            ? { from: from || undefined, to: to || undefined }
            : dateMode === 'month'
                ? { monthly: true }
                : {};
        const effDate = dateMode === 'range' ? undefined : (date || undefined);
        if (mode === 'receipts') {
            fetchMyPaymentReceipts(token, { ...opts, date: effDate })
                .then(data => { setReceipts(data); setLoading(false); })
                .catch(() => { setError(t.ofinErrLoad); setLoading(false); });
        } else {
            fetchMyOrderFinance(token, effDate, mode === 'payments', opts)
                .then(data => { setItems(data); setLoading(false); })
                .catch(() => { setError(t.ofinErrLoad); setLoading(false); });
        }
    }, [token, date, dateMode, from, to, mode, t.ofinErrLoad]);

    useEffect(() => { load(); }, [load]);

    // Exports the same rows currently on screen — reuses the exact date-filter translation `load` does.
    const handleExport = async () => {
        if (!token) return;
        setExporting(true);
        const opts = dateMode === 'range'
            ? { from: from || undefined, to: to || undefined }
            : dateMode === 'month'
                ? { monthly: true }
                : {};
        const effDate = dateMode === 'range' ? undefined : (date || undefined);
        try {
            await downloadMyOrderFinanceExcel(token, effDate, mode === 'payments', { ...opts, lang });
        } catch {
            setError(t.ofinExportFail);
        } finally {
            setExporting(false);
        }
    };

    // Downloads an invoice of the currently filtered sender-pays orders (same date filter as
    // Export), with the company's bank account and a service-fee total.
    const handleInvoiceExport = async () => {
        if (!token) return;
        setInvoiceExporting(true);
        const opts = dateMode === 'range'
            ? { from: from || undefined, to: to || undefined }
            : dateMode === 'month'
                ? { monthly: true }
                : {};
        const effDate = dateMode === 'range' ? undefined : (date || undefined);
        try {
            await downloadMyOrderFinanceInvoiceExcel(token, effDate, mode === 'payments', { ...opts, lang });
        } catch {
            setError(t.ofinInvoiceExportFail);
        } finally {
            setInvoiceExporting(false);
        }
    };

    const todayStr = toDateStr(new Date());
    const monthStr = todayStr.slice(0, 7);
    const shiftDay = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + delta);
        return toDateStr(base);
    });
    const shiftMonth = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(1);
        base.setMonth(base.getMonth() + delta);
        return toDateStr(base);
    });
    const atToday = date !== '' && (dateMode === 'month' ? date.slice(0, 7) >= monthStr : date >= todayStr);
    // Human label for the "showing" line, per active date mode.
    const showingLabel = dateMode === 'range'
        ? (from || to ? `${from || '…'} – ${to || '…'}` : t.statAllDates)
        : dateMode === 'month'
            ? (date ? date.slice(0, 7) : t.statAllDates)
            : (date ? readableDate(date) : t.statAllDates);

    // Narrow the loaded orders by recipient city/district/address before counting/showing.
    const filtered = items.filter(i =>
        (!city || i.recipientCity === city)
        && (!district || i.recipientDistrict === district)
        && (!address || (i.recipientAddress ?? '').toLowerCase().includes(address.trim().toLowerCase())));
    const hasLocationFilter = !!city || !!district || !!address.trim();

    // Remaining (outstanding) balances — mirrors the admin's per-customer "owed" figures:
    //  · codRemaining     — COD the company still has to pay out for delivered orders.
    //  · serviceRemaining — sender-paid service fee the customer still has to pay the company.
    // Both are already net of whatever's been paid so far (see codOutstanding/serviceOutstanding);
    // that already-paid portion is what the Balance card below breaks out separately.
    const codRemaining = round2(filtered.reduce((s, i) => s + codOutstanding(i), 0));
    const serviceRemaining = round2(filtered.reduce((s, i) => s + serviceOutstanding(i), 0));

    // Not-yet-delivered COD still in the pipeline (accepted in warehouse through delivery,
    // nothing collected yet — a forecast, not a balance) + the combined "COD" headline figure.
    const codNotDelivered = round2(filtered.reduce((s, i) => s + codExpected(i), 0));
    const codTotal = round2(codRemaining + codNotDelivered);

    // Balance — cash that has actually changed hands so far: COD the company has already paid out
    // to the customer, minus the service fee the customer has already paid the company.
    const codPaid = filtered.reduce(
        (s, i) => (i.isBillableFailedDelivery || isCancelledNonBillable(i)) ? s : s + (i.codPaidToCustomerAmount ?? 0), 0);
    const servicePaid = filtered.reduce(
        (s, i) => (i.senderOwesService && !isCancelledNonBillable(i)) ? s + (i.servicePaidByCustomerAmount ?? 0) : s, 0);
    const codPaidNet = codPaid - servicePaid;

    // Receipts-mode totals: gross paid out per type, and the net cash handed to the customer
    // (COD paid out minus service fees collected).
    const receiptsCodTotal = receipts.filter(r => !r.isService).reduce((s, r) => s + r.totalAmount, 0);
    const receiptsServiceTotal = receipts.filter(r => r.isService).reduce((s, r) => s + r.totalAmount, 0);
    const receiptsNetPaid = receiptsCodTotal - receiptsServiceTotal;

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">{t.statTitle}</h2>

            {/* Mode toggle: placed (by delivery, matches admin) vs payments (by COD-paid date) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={segWrap}>
                    <button style={{ ...segBtn(mode === 'placed'), borderRight: '1px solid var(--color-border)' }} onClick={() => setMode('placed')}>{t.ofinTabPlaced}</button>
                    <button style={{ ...segBtn(mode === 'payments'), borderRight: '1px solid var(--color-border)' }} onClick={() => setMode('payments')}>{t.ofinTabPayments}</button>
                    <button style={segBtn(mode === 'receipts')} onClick={() => setMode('receipts')}>{t.ofinTabReceipts}</button>
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text)', fontWeight: 600 }}>
                    {t.ofinShowing(showingLabel)}
                </span>
            </div>

            {/* Date filter: Day / Month / Range */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{mode === 'payments' ? t.ofinPaidDate : t.ofinFilterDelivered}</span>
                <div style={segWrap}>
                    <button style={{ ...segBtn(dateMode === 'day'), borderRight: '1px solid var(--color-border)' }} onClick={() => setDateMode('day')}>{t.ofinViewDaily}</button>
                    <button style={{ ...segBtn(dateMode === 'month'), borderRight: '1px solid var(--color-border)' }} onClick={() => setDateMode('month')}>{t.ofinViewMonthly}</button>
                    <button style={segBtn(dateMode === 'range')} onClick={() => setDateMode('range')}>{t.ofinViewRange}</button>
                </div>
                {dateMode === 'day' && (
                    <>
                        <button onClick={() => shiftDay(-1)} title={t.statPrevDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>‹</button>
                        <input type="date" value={date} max={todayStr} onChange={e => setDate(e.target.value)} style={fDateInput} />
                        <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>›</button>
                        {date && <button onClick={() => setDate('')} className="btn-ghost btn-ghost--sm">{t.statAllDates}</button>}
                    </>
                )}
                {dateMode === 'month' && (
                    <>
                        <button onClick={() => shiftMonth(-1)} title={t.ofinPrevMonth} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>‹</button>
                        <input type="month" value={date ? date.slice(0, 7) : ''} max={monthStr}
                            onChange={e => setDate(e.target.value ? e.target.value + '-01' : '')} style={fDateInput} />
                        <button onClick={() => !atToday && shiftMonth(1)} disabled={atToday} title={t.ofinNextMonth} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>›</button>
                        {date && <button onClick={() => setDate('')} className="btn-ghost btn-ghost--sm">{t.statAllDates}</button>}
                    </>
                )}
                {dateMode === 'range' && (
                    <>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>{t.finOvFrom}</span>
                        <input type="date" value={from} max={to || todayStr} onChange={e => setFrom(e.target.value)} style={fDateInput} />
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>{t.finOvTo}</span>
                        <input type="date" value={to} min={from || undefined} max={todayStr} onChange={e => setTo(e.target.value)} style={fDateInput} />
                        {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="btn-ghost btn-ghost--sm">{t.statAllDates}</button>}
                    </>
                )}
                <button onClick={load} className="btn-ghost btn-ghost--sm" style={{ marginLeft: 4 }}>{t.statRefresh}</button>
                {mode !== 'receipts' && (
                    <button onClick={handleExport} disabled={exporting} className="btn-ghost btn-ghost--sm">
                        {exporting ? '…' : t.ofinExport}
                    </button>
                )}
                {mode !== 'receipts' && (
                    <button onClick={handleInvoiceExport} disabled={invoiceExporting} className="btn-ghost btn-ghost--sm">
                        {invoiceExporting ? '…' : t.ofinInvoiceExport}
                    </button>
                )}
            </div>

            {/* Recipient-location filter (client-side over the loaded orders): city/district + address */}
            {mode !== 'receipts' && (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 360px', minWidth: 240, maxWidth: 480 }}>
                        <CityDistrictPicker
                            cityValue={city}
                            districtValue={district}
                            onCityChange={c => { setCity(c); setDistrict(''); }}
                            onDistrictChange={setDistrict}
                        />
                    </div>
                    <input type="text" value={address} placeholder={t.ofinSearchAddress}
                        onChange={e => setAddress(e.target.value)}
                        style={{ flex: '1 1 200px', minWidth: 160, maxWidth: 320, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem', padding: '6px 10px', outline: 'none' }} />
                    {hasLocationFilter && (
                        <button onClick={() => { setCity(''); setDistrict(''); setAddress(''); }} className="btn-ghost btn-ghost--sm">{t.statAllDates}</button>
                    )}
                </div>
            )}

            {loading ? (
                <div className="dashboard__loader">{t.statLoading}</div>
            ) : error ? (
                <div className="dashboard__error">{error} <button onClick={load}>{t.statRetry}</button></div>
            ) : mode === 'receipts' ? (
                receipts.length === 0 ? (
                    <div className="dashboard__empty" style={{ marginTop: 40 }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🧾</div>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.finPayHistNone}</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.statNoRecordsHint}</div>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                            {[
                                { label: t.finPayHistCodTotal,     value: gel(receiptsCodTotal),     accent: false },
                                { label: t.finPayHistServiceTotal, value: gel(receiptsServiceTotal),  accent: true  },
                                { label: t.finPayHistNetPaid,      value: gel(receiptsNetPaid),       accent: false, highlight: true },
                            ].map(({ label, value, accent, highlight }) => (
                                <div key={label} style={{ background: highlight ? 'rgba(5,150,105,0.08)' : accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)', border: `1px solid ${highlight ? 'rgba(5,150,105,0.25)' : accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: highlight ? '#059669' : accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{label}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...headCell, textAlign: 'center', width: 36 }}>#</th>
                                        <th style={headCell}>{t.finPayHistThDate}</th>
                                        <th style={headCell}>{t.finPayHistThType}</th>
                                        <th style={{ ...headCell, textAlign: 'right' }}>{t.finPayHistThOrders}</th>
                                        <th style={{ ...headCell, textAlign: 'right' }}>{t.finPayHistCodTotal}</th>
                                        <th style={{ ...headCell, textAlign: 'right' }}>{t.finPayHistServiceTotal}</th>
                                        <th style={{ ...headCell, width: 28 }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {receipts.map((r, i) => {
                                        const expanded = expandedReceiptId === r.id;
                                        return (
                                            <Fragment key={r.id}>
                                                <tr
                                                    onClick={() => setExpandedReceiptId(expanded ? null : r.id)}
                                                    style={{ background: i % 2 ? 'var(--color-bg)' : 'var(--color-bg-2)', cursor: 'pointer' }}
                                                >
                                                    <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{i + 1}</td>
                                                    <td style={cell}>{new Date(r.paidAt).toLocaleString(lang === 'ka' ? 'ka-GE' : 'en-US', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'numeric', day: 'numeric' })}</td>
                                                    <td style={cell}><Badge text={r.isService ? t.finPayHistService : t.finPayHistCod} tone={r.isService ? 'unpaid' : 'paid'} /></td>
                                                    <td style={{ ...cell, textAlign: 'right' }}>{r.orders.length}</td>
                                                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{!r.isService ? gel(r.totalAmount) : <span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>—</span>}</td>
                                                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{r.isService ? gel(r.totalAmount) : <span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>—</span>}</td>
                                                    <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
                                                        <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr>
                                                        <td colSpan={7} style={{ padding: 0, border: '1px solid var(--color-border)' }}>
                                                            <div style={{ overflowX: 'auto', padding: '10px 14px', background: 'var(--color-bg)' }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={headCell}>{t.finPayHistThTracking}</th>
                                                                            <th style={headCell}>{t.finPayHistThRecipient}</th>
                                                                            <th style={headCell}>{t.finPayHistThAddress}</th>
                                                                            <th style={headCell}>{t.finPayHistThDelivered}</th>
                                                                            <th style={{ ...headCell, textAlign: 'right' }}>{t.finPayHistThAmount}</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {r.orders.map(o => (
                                                                            <tr key={o.orderId}>
                                                                                <td style={cell}>{o.trackingNumber}</td>
                                                                                <td style={cell}>{o.recipientName}</td>
                                                                                <td style={cell}>{o.recipientAddress}</td>
                                                                                <td style={cell}>{o.deliveredAt ? new Date(o.deliveredAt).toLocaleString(lang === 'ka' ? 'ka-GE' : 'en-US', { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'numeric', day: 'numeric' }) : '—'}</td>
                                                                                <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{gel(o.amount)}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: 'var(--color-bg-3)', fontWeight: 800 }}>
                                        <td colSpan={3} style={cell}>{t.finPayHistTotal}</td>
                                        <td style={{ ...cell, textAlign: 'right' }}>{receipts.reduce((s, r) => s + r.orders.length, 0)}</td>
                                        <td style={{ ...cell, textAlign: 'right', color: '#059669' }}>{gel(receiptsCodTotal)}</td>
                                        <td style={{ ...cell, textAlign: 'right', color: 'var(--color-accent)' }}>{gel(receiptsServiceTotal)}</td>
                                        <td style={cell} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )
            ) : items.length === 0 ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        {dateMode === 'range'
                            ? (from || to ? t.ofinNoneDay : t.ofinNoneAll)
                            : dateMode === 'month'
                                ? (date ? t.ofinNoneMonth : t.ofinNoneAll)
                                : (date ? t.ofinNoneDay : t.ofinNoneAll)}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.statNoRecordsHint}</div>
                </div>
            ) : filtered.length === 0 ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.reNoOrders}</div>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                        {/* Balance: COD already paid out to the customer minus the service fee they've
                            already paid — cash that has actually changed hands so far, in the customer's
                            favour when green, against them when amber. */}
                        {(() => {
                            const inYourFavour = codPaidNet >= -0.005;
                            const fg = inYourFavour ? '#059669' : '#b45309';
                            return (
                                <div style={{
                                    background: inYourFavour ? 'rgba(5,150,105,0.08)' : 'rgba(180,83,9,0.08)',
                                    border: `1px solid ${inYourFavour ? 'rgba(5,150,105,0.25)' : 'rgba(180,83,9,0.25)'}`,
                                    borderRadius: 10, padding: '12px 10px', textAlign: 'center',
                                }}>
                                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: fg }}>{gel(Math.abs(codPaidNet))}</div>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.ofinSumBalance}</div>
                                    <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', marginTop: 3 }}>
                                        {t.ofinSumNetFormula(gel(codPaid), gel(servicePaid))}
                                    </div>
                                </div>
                            );
                        })()}
                        {/* COD: what the company still has to transfer to the customer — delivered orders
                            not yet paid out (pink), plus not-yet-delivered orders already accepted in
                            warehouse (orange, expected — nothing collected yet, so not a balance). */}
                        <div style={{ background: 'rgba(219,39,119,0.08)', border: '1px solid rgba(219,39,119,0.25)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#db2777' }}>{gel(codTotal)}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.ofinSumCodCollected}</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: '0.62rem', marginTop: 3, flexWrap: 'wrap' }}>
                                <span style={{ color: '#db2777', fontWeight: 700 }}>{t.ofinSumDelivered}: {gel(codRemaining)}</span>
                                <span style={{ color: '#ea580c', fontWeight: 700 }}>{t.ofinSumNotDelivered}: {gel(codNotDelivered)}</span>
                            </div>
                        </div>
                        {[
                            { label: t.ofinSumYouOwe, value: gel(serviceRemaining), color: '#dc2626' },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color }}>{value}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                            <thead>
                                <tr>
                                    <th style={{ ...headCell, textAlign: 'center', width: 36 }}>#</th>
                                    <th style={headCell}>{t.ofinColTracking}</th>
                                    <th style={headCell}>{t.ofinColRecipient}</th>
                                    <th style={headCell}>{t.ofinColType}</th>
                                    <th style={headCell}>{t.ofinColStatus}</th>
                                    <th style={{ ...headCell, textAlign: 'right' }}>{t.ofinColCod}</th>
                                    <th style={{ ...headCell, textAlign: 'right' }}>{t.ofinColService}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((line, i) => <OrderTableRow key={line.orderId} line={line} index={i} />)}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
