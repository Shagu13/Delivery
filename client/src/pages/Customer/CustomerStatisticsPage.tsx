import { useEffect, useState, useCallback } from 'react';
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchMyCustomerStatistics } from '../../api/customerStatistics';
import type { CustomerStatistics } from '../../api/customerStatistics';
import '../../styles/dashboard.css';

// Outcome colours, shared by the bar, pie and summary cards.
const C_DELIVERED  = '#059669';
const C_INTRANSIT  = '#d97706';
const C_CANCELLED  = '#dc2626';

export function CustomerStatisticsPage() {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [data, setData] = useState<CustomerStatistics | null>(null);
    const [year, setYear] = useState<number | undefined>(undefined); // undefined = latest active year
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        fetchMyCustomerStatistics(token, year)
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { setError(t.statsLoadFailed); setLoading(false); });
    }, [token, year, t.statsLoadFailed]);

    useEffect(() => { load(); }, [load]);

    if (loading && !data) {
        return <div className="dashboard__loader" style={{ padding: 40 }}>{t.statsLoading}</div>;
    }
    if (error) {
        return (
            <div className="dashboard__error">
                {error} <button onClick={load}>{t.statRetry}</button>
            </div>
        );
    }
    if (!data) return null;

    const hasActivity = data.totalPlaced > 0 || data.availableYears.length > 0;

    // Stacked bars: one row per month, localized month label on the X axis.
    const barData = data.monthly.map(m => ({
        name: t.finMonths[m.month - 1],
        [t.statsDelivered]: m.delivered,
        [t.statsInTransit]: m.inTransit,
        [t.statsCancelled]: m.cancelled,
    }));

    const pieData = [
        { name: t.statsDelivered, value: data.totalDelivered, color: C_DELIVERED },
        { name: t.statsInTransit, value: data.totalInTransit, color: C_INTRANSIT },
        { name: t.statsCancelled, value: data.totalCancelled, color: C_CANCELLED },
    ].filter(d => d.value > 0);

    return (
        <div className="dashboard__section">
            {/* Header + year selector */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                <h2 className="dashboard__title" style={{ margin: 0 }}>{t.navStatistics}</h2>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {t.statsYearLabel}
                    <select
                        value={data.year}
                        onChange={e => setYear(Number(e.target.value))}
                        style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem', padding: '6px 10px', outline: 'none' }}
                    >
                        {(data.availableYears.length > 0 ? data.availableYears : [data.year]).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </label>
            </div>

            {!hasActivity ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.statsEmpty}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>{t.statsEmptyHint}</div>
                </div>
            ) : (
                <>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: t.statsSummaryPlaced,    value: data.totalPlaced,    color: 'var(--color-text)' },
                            { label: t.statsSummaryDelivered, value: data.totalDelivered, color: C_DELIVERED },
                            { label: t.statsSummaryInTransit, value: data.totalInTransit, color: C_INTRANSIT },
                            { label: t.statsSummaryCancelled, value: data.totalCancelled, color: C_CANCELLED },
                        ].map(({ label, value, color }) => (
                            <div key={label} style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 12px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.4rem', fontWeight: 800, color }}>{value}</div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Monthly stacked bar chart */}
                    <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 12px 8px', marginBottom: 16 }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-subtle)', padding: '0 6px 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t.statsMonthlyTitle}
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={barData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-text-subtle)' }} />
                                <Tooltip
                                    contentStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }}
                                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                <Bar dataKey={t.statsDelivered} stackId="a" fill={C_DELIVERED} radius={[0, 0, 0, 0]} />
                                <Bar dataKey={t.statsInTransit} stackId="a" fill={C_INTRANSIT} />
                                <Bar dataKey={t.statsCancelled} stackId="a" fill={C_CANCELLED} radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                        {/* Outcome breakdown pie */}
                        <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 12px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-subtle)', padding: '0 6px 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t.statsBreakdownTitle}
                            </div>
                            {pieData.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: 40 }}>{t.statsEmpty}</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} paddingAngle={2}>
                                            {pieData.map(d => <Cell key={d.name} fill={d.color} />)}
                                        </Pie>
                                        <Tooltip contentStyle={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: '0.8rem' }} />
                                        <Legend wrapperStyle={{ fontSize: '0.78rem' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        {/* Top recipients */}
                        <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 12px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-subtle)', padding: '0 6px 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {t.statsTopRecipientsTitle}
                            </div>
                            {data.topRecipients.length === 0 ? (
                                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', padding: 40 }}>{t.statsEmpty}</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {data.topRecipients.map((r, i) => (
                                        <div key={r.phone} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', borderBottom: i < data.topRecipients.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                                            <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 6, background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)', fontSize: '0.72rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {i + 1}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {r.name}
                                                </div>
                                                <div style={{ fontSize: '0.74rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {r.phone} · {r.city}, {r.district}, {r.address}
                                                </div>
                                            </div>
                                            <span style={{ flexShrink: 0, fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                                                {t.statsOrdersCount(r.orderCount)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
