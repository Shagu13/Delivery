import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchMySettlements } from '../../api/settlements';
import type { CourierSettlementItem } from '../../api/settlements';
import '../../styles/dashboard.css';

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontWeight: highlight ? 700 : 600, color: highlight ? 'var(--color-accent)' : 'var(--color-text)', fontSize: highlight ? '1rem' : '0.875rem' }}>{value}</span>
        </div>
    );
}

function SettlementCard({ item }: { item: CourierSettlementItem }) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    // For negative-transfer days the company owes the courier their salary;
    // those days are "done" once wasCourierPaid, not waiting for isTheDayClosed.
    const isDone = item.isTheDayClosed
        || (item.totalCourierTransferToCompany < 0 && item.wasCourierPaid);
    return (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <button onClick={() => setExpanded(e => !e)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: expanded ? 'var(--color-bg-2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)' }}>{fmtDate(item.date)}</span>
                        {isDone
                            ? <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#059669', background: '#d1fae5', borderRadius: '100px', padding: '2px 8px' }}>{t.cdSettClosed}</span>
                            : <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#f97316', background: 'rgba(249,115,22,0.1)', borderRadius: '100px', padding: '2px 8px' }}>{t.cdSettPending}</span>
                        }
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>📦 {t.cdSettNDelivered(item.totalOrdersDelivered)}</span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-accent)', fontWeight: 700 }}>{t.cdSettSalaryLine} ₾{item.totalCourierSalary.toFixed(2)}</span>
                        {item.totalAmountOfCashCollected > 0 && <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.cdSettCashLine} ₾{item.totalAmountOfCashCollected.toFixed(2)}</span>}
                    </div>
                </div>
                <span style={{ fontSize: '1rem', color: 'var(--color-text-subtle)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}>›</span>
            </button>

            {expanded && (
                <div style={{ padding: '4px 16px 16px' }}>
                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        {[
                            { label: t.cdSettLabelDeliveries, value: item.totalOrdersDelivered },
                            { label: t.cdSettLabelPickups,    value: item.totalOrdersPickedUp },
                        ].map(({ label, value }) => (
                            <div key={label} style={{ background: 'var(--color-bg-2)', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text)' }}>{value}</div>
                            </div>
                        ))}
                    </div>
                    <FinRow label={t.cdSettCashCollected} value={`₾${item.totalAmountOfCashCollected.toFixed(2)}`} />
                    <FinRow label={t.cdSettTotalFees}     value={`₾${item.totalCompanyServiceRevenue.toFixed(2)}`} />
                    <FinRow label={t.cdSettYourSalary}    value={`₾${item.totalCourierSalary.toFixed(2)}`} highlight />
                    {item.totalAmountOfCashCollected > 0 && item.totalCourierTransferToCompany >= 0 && (
                        <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: isDone ? '#d1fae5' : '#fef3c7', border: `1px solid ${isDone ? '#6ee7b7' : '#fde047'}` }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: isDone ? '#065f46' : '#92400e', marginBottom: '4px' }}>
                                {isDone ? t.cdSettTransferDone : t.cdSettTransferPending}
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isDone ? '#059669' : '#b45309' }}>₾{item.totalCourierTransferToCompany.toFixed(2)}</div>
                            <div style={{ fontSize: '0.73rem', color: isDone ? '#047857' : '#92400e', marginTop: '2px' }}>{t.cdSettTransferHint}</div>
                        </div>
                    )}
                    {item.totalCourierTransferToCompany < 0 && (
                        <div style={{ marginTop: '12px', padding: '12px 14px', borderRadius: '8px', background: item.wasCourierPaid ? '#d1fae5' : '#eff6ff', border: `1px solid ${item.wasCourierPaid ? '#6ee7b7' : '#93c5fd'}` }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: item.wasCourierPaid ? '#065f46' : '#1d4ed8', marginBottom: '4px' }}>
                                {item.wasCourierPaid ? 'Salary received from company' : 'Company will pay your salary'}
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: item.wasCourierPaid ? '#059669' : '#2563eb' }}>
                                ₾{Math.abs(item.totalCourierTransferToCompany).toFixed(2)}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: item.wasCourierPaid ? '#047857' : '#3b82f6', marginTop: '2px' }}>
                                Service fees were paid directly by senders
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const navBtnStyle: React.CSSProperties = {
    background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', padding: '5px 9px', cursor: 'pointer',
    color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center',
};

function SummaryBar({ items }: { items: CourierSettlementItem[] }) {
    const { t } = useLanguage();
    const totalSalary     = items.reduce((s, i) => s + i.totalCourierSalary, 0);
    const totalDeliveries = items.reduce((s, i) => s + i.totalOrdersDelivered, 0);
    const totalCash       = items.reduce((s, i) => s + i.totalAmountOfCashCollected, 0);
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            {[
                { label: t.cdSettSummaryDeliveries, value: totalDeliveries.toString(), icon: '📦', accent: false },
                { label: t.cdSettSummarySalary,     value: `₾${totalSalary.toFixed(2)}`, icon: '💰', accent: true },
                { label: t.cdSettSummaryCash,       value: `₾${totalCash.toFixed(2)}`, icon: '💵', accent: false },
            ].map(({ label, value, icon, accent }) => (
                <div key={label} style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)', border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`, borderRadius: '10px', padding: '12px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.1rem', marginBottom: '4px' }}>{icon}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: '2px' }}>{label}</div>
                </div>
            ))}
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

    useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

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
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button onClick={() => goMonth(-1)} style={navBtnStyle}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                <span style={{ fontWeight: 700, fontSize: '0.95rem', minWidth: 140, textAlign: 'center' }}>
                    {MONTHS[month - 1]} {year}
                </span>
                <button
                    onClick={() => goMonth(1)}
                    disabled={year === now.getFullYear() && month === now.getMonth() + 1}
                    style={navBtnStyle}
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
                <button onClick={load} title="Refresh" style={{ ...navBtnStyle, marginLeft: 4 }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {items.map(item => <SettlementCard key={item.id} item={item} />)}
                    </div>
                </>
            )}
        </div>
    );
}
