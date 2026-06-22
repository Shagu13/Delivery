import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { fetchMyOrderFinance } from '../../api/orderFinance';
import type { OrderFinanceLine } from '../../api/orderFinance';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import '../../styles/dashboard.css';

const gel = (n: number) => `₾${n.toFixed(2)}`;

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
    const cod = line.codAmount ?? 0;
    const isSenderPays = line.whoPaysForCompanyService === 'Sender';
    const servicePaid = line.companyServicePaymentStatus === 'Paid';
    // COD is only owed back to the customer when there is a package amount to collect.
    // Orders with no COD (codAmount null/0) have nothing to pay back → no paid/unpaid label.
    const hasCod = cod > 0.005;
    const statusMeta = getStatusMeta(line.status, lang);
    const [statusBg, statusFg] = STATUS_COLORS[line.status] ?? ['var(--color-bg-3)', 'var(--color-text-subtle)'];

    return (
        <tr style={{ background: index % 2 ? 'var(--color-bg)' : 'var(--color-bg-2)' }}>
            <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{index + 1}</td>
            <td style={{ ...cell, fontWeight: 700 }}>{line.trackingNumber}</td>
            <td style={cell}>
                {recipientDisplayName(line.recipientName, t.recipientUnknown)}
                <span style={{ color: 'var(--color-text-subtle)' }}> · {line.recipientCity}</span>
            </td>
            <td style={cell}>{line.orderType}</td>
            <td style={cell}>
                <span title={statusMeta.description} style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: statusBg, color: statusFg }}>
                    {statusMeta.short}
                </span>
            </td>
            {/* COD — company owes customer */}
            <td style={{ ...cell, textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontWeight: 700 }}>{gel(cod)}</span>
                    {line.isCollectedCodPaidToCustomer
                        ? <Badge text={t.ofinPaid} tone="paid" />
                        : hasCod && <Badge text={t.ofinUnpaid} tone="unpaid" />}
                </div>
            </td>
            {/* Service fee — always show the amount so the customer knows the cost */}
            <td style={{ ...cell, textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                    <span style={{ fontWeight: 700 }}>{gel(line.companyServicePrice)}</span>
                    {isSenderPays
                        ? <Badge text={servicePaid ? t.ofinPaid : t.ofinUnpaid} tone={servicePaid ? 'paid' : 'unpaid'} />
                        : <Badge text={t.ofinRecipientPays} tone="muted" />}
                </div>
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
    // 'placed' filters by order creation date; 'payments' by the COD-payment date
    // (CodPaidToCustomerAt) — only orders whose COD was paid out are shown.
    const [mode, setMode] = useState<'placed' | 'payments'>('placed');
    const [date, setDate] = useState(toDateStr(new Date()));   // defaults to today ('' = all dates)
    const [items, setItems] = useState<OrderFinanceLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        fetchMyOrderFinance(token, date || undefined, mode === 'payments')
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError(t.ofinErrLoad); setLoading(false); });
    }, [token, date, mode, t.ofinErrLoad]);

    useEffect(() => { load(); }, [load]);

    const todayStr = toDateStr(new Date());
    const shiftDay = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + delta);
        return toDateStr(base);
    });
    const atToday = date !== '' && date >= todayStr;

    // Totals across the listed orders
    const codOutstanding = items.reduce((s, i) => s + ((i.codAmount ?? 0) - (i.codPaidToCustomerAmount ?? 0)), 0);
    // COD the company has already paid out to the customer.
    const codPaid = items.reduce((s, i) => s + (i.codPaidToCustomerAmount ?? 0), 0);
    const serviceOutstanding = items.reduce(
        (s, i) => i.whoPaysForCompanyService === 'Sender'
            ? s + (i.companyServicePrice - (i.servicePaidByCustomerAmount ?? 0))
            : s, 0);

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">{t.statTitle}</h2>

            {/* Mode toggle: placed (by creation) vs payments (by COD-paid date) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={segWrap}>
                    <button style={{ ...segBtn(mode === 'placed'), borderRight: '1px solid var(--color-border)' }} onClick={() => setMode('placed')}>{t.ofinTabPlaced}</button>
                    <button style={segBtn(mode === 'payments')} onClick={() => setMode('payments')}>{t.ofinTabPayments}</button>
                </div>
                <span style={{ fontSize: '0.82rem', color: 'var(--color-text)', fontWeight: 600 }}>
                    {t.ofinShowing(date ? readableDate(date) : t.statAllDates)}
                </span>
            </div>

            {/* Date filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{mode === 'payments' ? t.ofinPaidDate : t.ofinFilterPlaced}</span>
                <button onClick={() => shiftDay(-1)} title={t.statPrevDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>‹</button>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem', padding: '6px 10px', outline: 'none' }}
                />
                <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>›</button>
                {date && <button onClick={() => setDate('')} className="btn-ghost btn-ghost--sm">{t.statAllDates}</button>}
                <button onClick={load} className="btn-ghost btn-ghost--sm" style={{ marginLeft: 4 }}>{t.statRefresh}</button>
            </div>

            {loading ? (
                <div className="dashboard__loader">{t.statLoading}</div>
            ) : error ? (
                <div className="dashboard__error">{error} <button onClick={load}>{t.statRetry}</button></div>
            ) : items.length === 0 ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{date ? t.ofinNoneDay : t.ofinNoneAll}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.statNoRecordsHint}</div>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: t.ofinSumOrders,     value: items.length.toString(), accent: false },
                            { label: t.ofinSumCodOut,     value: gel(codOutstanding),     accent: true  },
                            { label: t.ofinSumCodPaidOut, value: gel(codPaid),            accent: false },
                            { label: t.ofinSumServiceOut, value: gel(serviceOutstanding), accent: false },
                        ].map(({ label, value, accent }) => (
                            <div key={label} style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)', border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
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
                                {items.map((line, i) => <OrderTableRow key={line.orderId} line={line} index={i} />)}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}
