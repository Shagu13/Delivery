import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchMyCustomerSettlements } from '../../api/customerSettlements';
import type { CustomerSettlement } from '../../api/customerSettlements';
import '../../styles/dashboard.css';

const gel = (n: number) => `₾${n.toFixed(2)}`;


function FinRow({ label, value, tone = 'default' }: {
    label: string; value: string; tone?: 'default' | 'owed' | 'paid' | 'out';
}) {
    const color =
        tone === 'paid' ? '#059669' :
        tone === 'out'  ? '#b45309' : 'var(--color-text)';
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 700, color }}>{value}</span>
        </div>
    );
}

function MoneyBlock({ title, owedLabel, owed, paid, paidLabel, outstanding }: {
    title: string; owedLabel: string; owed: number; paid: number; paidLabel?: string; outstanding: number;
}) {
    const { t } = useLanguage();
    return (
        <div style={{ background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 6 }}>{title}</div>
            <FinRow label={owedLabel}              value={gel(owed)}        tone="owed" />
            <FinRow label={paidLabel ?? t.statPaidSoFar} value={gel(paid)}  tone="paid" />
            <FinRow label={t.statOutstanding}      value={gel(outstanding)} tone="out" />
        </div>
    );
}

function InvoiceCard({ item }: { item: CustomerSettlement }) {
    const { t } = useLanguage();
    return (
        <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                        {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>📦 {t.custPkg(item.numberOfPackages)}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>✓ {t.statDelivered(item.totalNumberOfOrderDelivered)}</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                <MoneyBlock
                    title={t.statCodBlockTitle}
                    owedLabel={t.statCollectedForPackages}
                    owed={item.totalCODCompanyCollectedForPackages}
                    paid={item.totalAmountOfCollectedCodPaidByCompany}
                    outstanding={item.outstandingCodOwedToCustomer}
                />
                <MoneyBlock
                    title={t.statServiceBlockTitle}
                    owedLabel={t.statServicePriceOwed}
                    owed={item.totalCompanyServicePriceOwedToCompany}
                    paid={item.totalAmountPaidToCompanyForCompanyService}
                    paidLabel={t.statServiceFeePaid}
                    outstanding={item.outstandingServiceOwedToCompany}
                />
            </div>
        </div>
    );
}

export function CustomerStatisticsPage() {
    const { token } = useAuth();
    const { t } = useLanguage();
    const [date, setDate] = useState('');            // '' = all dates
    const [items, setItems] = useState<CustomerSettlement[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!token) return;
        setLoading(true); setError(null);
        fetchMyCustomerSettlements(token, date || undefined)
            .then(data => { setItems(data); setLoading(false); })
            .catch(() => { setError(t.statLoadFailed); setLoading(false); });
    }, [token, date, t.statLoadFailed]);

    useEffect(() => { load(); }, [load]);

    // Totals across the listed invoices
    const codOutstanding     = items.reduce((s, i) => s + i.outstandingCodOwedToCustomer, 0);
    const serviceOutstanding = items.reduce((s, i) => s + i.outstandingServiceOwedToCompany, 0);
    const totalDelivered     = items.reduce((s, i) => s + i.totalNumberOfOrderDelivered, 0);

    return (
        <div className="dashboard__section">
            <h2 className="dashboard__title">{t.statTitle}</h2>

            {/* Date filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{t.statFilterByDate}</span>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.85rem', padding: '6px 10px', outline: 'none' }}
                />
                {date && (
                    <button className="btn-ghost" onClick={() => setDate('')} style={{ fontSize: '0.8rem' }}>{t.statAllDates}</button>
                )}
                <button className="btn-ghost" onClick={load} style={{ marginLeft: 4 }}>{t.statRefresh}</button>
            </div>

            {loading ? (
                <div className="dashboard__loader">{t.statLoading}</div>
            ) : error ? (
                <div className="dashboard__error">{error} <button onClick={load}>{t.statRetry}</button></div>
            ) : items.length === 0 ? (
                <div className="dashboard__empty" style={{ marginTop: 40 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{date ? t.statNoneForDay : t.statNoneAll}</div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                        {t.statNoRecordsHint}
                    </div>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                        {[
                            { label: t.statSummaryDelivered,   value: totalDelivered.toString(), accent: false },
                            { label: t.statSummaryCodOwed,     value: gel(codOutstanding),       accent: true },
                            { label: t.statSummaryServiceOwed, value: gel(serviceOutstanding),   accent: false },
                        ].map(({ label, value, accent }) => (
                            <div key={label} style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)', border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`, borderRadius: 10, padding: '12px 10px', textAlign: 'center' }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{label}</div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {items.map(item => <InvoiceCard key={item.id} item={item} />)}
                    </div>
                </>
            )}
        </div>
    );
}
