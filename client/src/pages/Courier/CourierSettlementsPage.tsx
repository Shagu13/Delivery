import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { fetchMySettlements } from '../../api/settlements';
import type { CourierSettlementItem } from '../../api/settlements';
import { fetchCourierOrderFinance } from '../../api/orderFinance';
import type { OrderFinanceLine } from '../../api/orderFinance';
import '../../styles/dashboard.css';

const gel = (n: number) => `₾${n.toFixed(2)}`;
const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
];

function fmtDate(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function FinRow({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <div className="settle-finrow">
            <span className="settle-finrow__label">{label}</span>
            <span className={`settle-finrow__value${highlight ? ' settle-finrow__value--highlight' : ''}`}>{value}</span>
        </div>
    );
}

function SettlementCard({ item }: { item: CourierSettlementItem }) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    // Payment status is derived from salary owed vs. what has been credited.
    // remaining == 0 → fully paid; remaining > 0 → still owed to the courier.
    const remainingSalary = item.totalCourierSalary - item.totalCourierSalaryPaid;
    const isPaid = remainingSalary <= 0;
    const isDone = isPaid;
    return (
        <div className="settle-card">
            <button onClick={() => setExpanded(e => !e)} className={`settle-card__head${expanded ? ' settle-card__head--open' : ''}`}>
                <div className="settle-card__head-main">
                    <div className="settle-card__title-row">
                        <span className="settle-card__date">{fmtDate(item.date)}</span>
                        {isPaid
                            ? <span className="settle-badge settle-badge--closed">{t.cdSettPaid}</span>
                            : <span className="settle-badge settle-badge--pending">{t.cdSettPendingAmount(remainingSalary)}</span>
                        }
                    </div>
                    <div className="settle-card__meta">
                        <span className="settle-card__meta-item">📦 {t.cdSettNDelivered(item.totalOrdersDelivered)}</span>
                        <span className="settle-card__meta-item settle-card__meta-item--salary">{t.cdSettSalaryLine} ₾{item.totalCourierSalary.toFixed(2)}</span>
                        {item.totalAmountOfCashCollected > 0 && <span className="settle-card__meta-item">{t.cdSettCashLine} ₾{item.totalAmountOfCashCollected.toFixed(2)}</span>}
                    </div>
                </div>
                <span className="settle-card__chevron" style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>›</span>
            </button>

            {expanded && (
                <div className="settle-card__body">
                    <div className="settle-stats">
                        {[
                            { label: t.cdSettLabelDeliveries, value: item.totalOrdersDelivered },
                            { label: t.cdSettLabelPickups,    value: item.totalOrdersPickedUp },
                        ].map(({ label, value }) => (
                            <div key={label} className="settle-stat">
                                <div className="settle-stat__label">{label}</div>
                                <div className="settle-stat__value">{value}</div>
                            </div>
                        ))}
                    </div>
                    <FinRow label={t.cdSettCashCollected} value={`₾${item.totalAmountOfCashCollected.toFixed(2)}`} />
                    <FinRow label={t.cdSettYourSalary}    value={`₾${item.totalCourierSalary.toFixed(2)}`} highlight />
                    <FinRow label={t.cdSettRemaining}     value={`₾${Math.max(0, remainingSalary).toFixed(2)}`} highlight={!isPaid} />
                    {item.totalAmountOfCashCollected > 0 && item.totalCourierTransferToCompany >= 0 && (
                        <div className={`settle-transfer ${isDone ? 'settle-transfer--done' : 'settle-transfer--pending'}`}>
                            <div className="settle-transfer__label">{isDone ? t.cdSettTransferDone : t.cdSettTransferPending}</div>
                            <div className="settle-transfer__value">₾{item.totalCourierTransferToCompany.toFixed(2)}</div>
                            <div className="settle-transfer__hint">{t.cdSettTransferHint}</div>
                        </div>
                    )}
                    {item.totalCourierTransferToCompany < 0 && (
                        <div className="settle-transfer settle-transfer--credit">
                            <div className="settle-transfer__label">{t.cdSettCompanyPaysTitle}</div>
                            <div className="settle-transfer__value">₾{Math.abs(item.totalCourierTransferToCompany).toFixed(2)}</div>
                            <div className="settle-transfer__hint">{t.cdSettCompanyPaysHint}</div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function SummaryBar({ items }: { items: CourierSettlementItem[] }) {
    const { t } = useLanguage();
    const totalSalary     = items.reduce((s, i) => s + i.totalCourierSalary, 0);
    const totalDeliveries = items.reduce((s, i) => s + i.totalOrdersDelivered, 0);
    const totalCash       = items.reduce((s, i) => s + i.totalAmountOfCashCollected, 0);
    return (
        <div className="settle-summary">
            {[
                { label: t.cdSettSummaryDeliveries, value: totalDeliveries.toString(), icon: '📦', accent: false },
                { label: t.cdSettSummarySalary,     value: `₾${totalSalary.toFixed(2)}`, icon: '💰', accent: true },
                { label: t.cdSettSummaryCash,       value: `₾${totalCash.toFixed(2)}`, icon: '💵', accent: false },
            ].map(({ label, value, icon, accent }) => (
                <div key={label} className={`settle-summary__tile${accent ? ' settle-summary__tile--accent' : ''}`}>
                    <div className="settle-summary__icon">{icon}</div>
                    <div className="settle-summary__value">{value}</div>
                    <div className="settle-summary__label">{label}</div>
                </div>
            ))}
        </div>
    );
}

// ── Per-order list, filtered by delivery date ─────────────────────────────────────

function CourierOrdersByDay({ token }: { token: string }) {
    const { t } = useLanguage();
    const [date, setDate] = useState(toDateStr(new Date()));
    const [lines, setLines] = useState<OrderFinanceLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        fetchCourierOrderFinance(token, date || undefined)
            .then(data => { setLines(data); setLoading(false); })
            .catch(() => { setError(t.ofinErrLoad); setLoading(false); });
    }, [token, date, t.ofinErrLoad]);

    useEffect(() => { load(); }, [load]);

    const todayStr = toDateStr(new Date());
    const shiftDay = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + delta);
        return toDateStr(base);
    });
    const atToday = date !== '' && date >= todayStr;

    const totalSalary = lines.reduce((s, i) => s + (i.courierSalary ?? 0), 0);
    const totalCash   = lines.reduce((s, i) => s + (i.amountOfCashCollected ?? 0), 0);

    return (
        <div style={{ marginTop: 28 }}>
            <h3 className="dashboard__title" style={{ fontSize: '1rem' }}>{t.ofinFilterDelivered}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 16px', flexWrap: 'wrap' }}>
                <button onClick={() => shiftDay(-1)} title={t.statPrevDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>‹</button>
                <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem', padding: '6px 10px', outline: 'none' }} />
                <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay} className="btn-ghost btn-ghost--sm" style={{ fontSize: '0.95rem' }}>›</button>
                <button onClick={load} className="btn-ghost btn-ghost--sm" style={{ marginLeft: 4 }}>{t.statRefresh}</button>
            </div>

            {loading ? (
                <div className="dashboard__loader">{t.statLoading}</div>
            ) : error ? (
                <div className="dashboard__error">{error} <button onClick={load}>{t.statRetry}</button></div>
            ) : lines.length === 0 ? (
                <div className="dashboard__empty"><div style={{ fontWeight: 600 }}>{t.ofinNoneDay}</div></div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
                        {[
                            { label: t.ofinSumOrders,   value: lines.length.toString() },
                            { label: t.ofinColSalary,   value: gel(totalSalary) },
                            { label: t.ofinColCash,     value: gel(totalCash) },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)' }}>{value}</div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {lines.map(line => (
                            <div key={line.orderId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '10px 14px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 10 }}>
                                <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)' }}>{line.trackingNumber}</span>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 7px', borderRadius: 100, background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)' }}>{line.orderType}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                        {recipientDisplayName(line.recipientName, t.recipientUnknown)} · {line.recipientCity}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', minWidth: 90 }}>
                                    <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.ofinColSalary}</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)' }}>{gel(line.courierSalary ?? 0)}</div>
                                </div>
                                <div style={{ textAlign: 'right', minWidth: 90 }}>
                                    <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.ofinColCash}</div>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--color-text)' }}>{gel(line.amountOfCashCollected ?? 0)}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

export function CourierSettlementsPage() {
    const { token } = useAuth();
    const { t } = useLanguage();
    const now = new Date();
    const [year,    setYear]    = useState(now.getFullYear());
    const [month,   setMonth]   = useState(now.getMonth() + 1);
    const [items,   setItems]   = useState<CourierSettlementItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState<string | null>(null);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        fetchMySettlements(token, year, month)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError(t.cdSettFailed); setLoading(false); });
    }, [token, year, month, t.cdSettFailed]);

    useEffect(() => { load(); }, [load]);

    const goMonth = (delta: number) => {
        let m = month + delta, y = year;
        if (m > 12) { m = 1;  y++; }
        if (m < 1)  { m = 12; y--; }
        setMonth(m); setYear(y);
    };

    if (loading) return <div className="dashboard__loader">{t.cdSettLoading}</div>;
    if (error)   return <div className="dashboard__error">{error} <button onClick={load}>{t.cdRetry}</button></div>;

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">{t.cdSettTitle}</h2>

            {/* Month picker */}
            <div className="settle-month-nav">
                <button onClick={() => goMonth(-1)} className="settle-nav-btn">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                <span className="settle-month-label">{MONTHS[month - 1]} {year}</span>
                <button
                    onClick={() => goMonth(1)}
                    disabled={year === now.getFullYear() && month === now.getMonth() + 1}
                    className="settle-nav-btn"
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                <button onClick={load} title={t.cdSettRefresh} className="settle-nav-btn" style={{ marginLeft: 4 }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M2 8a6 6 0 1 0 1-3.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <path d="M2 4v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            {items.length === 0 ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.cdSettEmpty}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.cdSettEmptyHint}</div>
                </div>
            ) : (
                <>
                    <SummaryBar items={items} />
                    <div className="settle-list">
                        {items.map(item => <SettlementCard key={item.date} item={item} />)}
                    </div>
                </>
            )}

            {token && <CourierOrdersByDay token={token} />}
        </div>
    );
}
