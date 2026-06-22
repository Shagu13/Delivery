import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import {
    fetchCustomerOrderFinance,
    payCustomerOrders,
    OrderFinanceApiError,
} from '../../api/orderFinance';
import type { OrderFinanceLine } from '../../api/orderFinance';
import { fetchCompanyFinanceOverview, CompanyFinanceApiError } from '../../api/companyFinance';
import type { CompanyFinanceOverview } from '../../api/companyFinance';
import { CourierSettlementsSection } from './CourierSettlementsSection';
import { AdminFinanceHistoryTab } from './AdminFinanceHistoryTab';
import { OutstandingBalancesModal } from './OutstandingBalancesModal';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// ── Customer search/select ──────────────────────────────────────────────────────

function CustomerPicker({ token, selected, onSelect, onClear }: {
    token: string;
    selected: AdminCustomer | null;
    onSelect: (c: AdminCustomer) => void;
    onClear: () => void;
}) {
    const { t } = useLanguage();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<AdminCustomer[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
            getCustomers(token, 1, 50, search)
                .then(r => setResults(r.items))
                .catch(() => setResults([]));
        }, 300);
        return () => { if (debounce.current) clearTimeout(debounce.current); };
    }, [token, search]);

    return (
        <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 400 }}>
            {selected && !open ? (
                <div
                    onClick={() => { setOpen(true); setSearch(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'text', minHeight: 36 }}
                >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--color-text-subtle)' }}>
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selected.businessName}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {selected.firstName} {selected.lastName} · {selected.phoneNumber}
                        </div>
                    </div>
                    <button
                        onClick={e => { e.stopPropagation(); onClear(); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: '2px 5px', borderRadius: 4, fontSize: '1.05rem', lineHeight: 1, flexShrink: 0 }}
                        title="Clear"
                    >×</button>
                </div>
            ) : (
                <div className="go-search" style={{ maxWidth: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder={t.finSearchCustomer}
                        value={search}
                        onChange={e => { setSearch(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        autoComplete="off"
                    />
                </div>
            )}
            {open && results.length > 0 && (
                <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 -8px 28px rgba(0,0,0,0.16)', maxHeight: 260, overflowY: 'auto' }}>
                    {results.map(c => (
                        <button
                            key={c.id}
                            onClick={() => { onSelect(c); setOpen(false); setSearch(''); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: selected?.id === c.id ? 'var(--color-accent-dim)' : 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                        >
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)' }}>{c.businessName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{c.firstName} {c.lastName} · {c.phoneNumber}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Figure row ──────────────────────────────────────────────────────────────────

function Row({ label, value, strong = false, tone }: {
    label: string; value: string; strong?: boolean; tone?: 'paid' | 'out' | 'red';
}) {
    const color = tone === 'paid' ? '#059669' : tone === 'red' ? '#ef4444' : tone === 'out' ? '#b45309' : 'var(--color-text)';
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontWeight: strong ? 800 : 600, color }}>{value}</span>
        </div>
    );
}

// ── Company finance overview ──────────────────────────────────────────────────

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function CompanyOverviewCard({ token, refreshSignal }: { token: string; refreshSignal: number }) {
    const { t } = useLanguage();
    const now = new Date();
    const [from, setFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    const [to, setTo] = useState(isoDate(now));
    const [data, setData] = useState<CompanyFinanceOverview | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetchCompanyFinanceOverview(from, to, token)
            .then(setData)
            .catch(e => setError(e instanceof CompanyFinanceApiError ? e.message : t.finOvLoadFailed))
            .finally(() => setLoading(false));
    }, [from, to, token, t.finOvLoadFailed]);

    // Reload on date change AND whenever a settlement action bumps refreshSignal,
    // so the cash position reflects a just-recorded payment without a page refresh.
    useEffect(() => { load(); }, [load, refreshSignal]);

    const stats = data ? [
        { label: t.finOvDelivered,      value: String(data.ordersDelivered),    accent: false },
        { label: t.finOvServiceRevenue, value: gel(data.serviceRevenue),         accent: false },
        { label: t.finOvCourierSalary,  value: gel(data.courierSalary),          accent: false },
        { label: t.finOvNetMargin,      value: gel(data.netOperatingMargin),     accent: true  },
    ] : [];

    return (
        <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    {t.finOvTitle}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvFrom}</span>
                    <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvTo}</span>
                    <input type="date" value={to} min={from} max={isoDate(now)} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
                </div>
            </div>

            {error ? (
                <div style={{ padding: '10px 14px', color: '#ef4444', fontSize: '0.82rem' }}>{error}</div>
            ) : loading || !data ? (
                <div style={{ padding: 16, textAlign: 'center' }}><div className="go-spinner" style={{ margin: '0 auto' }} /></div>
            ) : (
                <>
                    {/* Primary stat strip */}
                    <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                        {stats.map((s, i) => (
                            <div key={s.label} style={{
                                flex: '1 1 0', minWidth: 110, padding: '10px 14px',
                                borderRight: i < stats.length - 1 ? '1px solid var(--color-border)' : 'none',
                                background: s.accent ? 'var(--color-accent-dim)' : 'transparent',
                                textAlign: 'center',
                            }}>
                                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: s.accent ? 'var(--color-accent)' : 'var(--color-text)' }}>
                                    {s.value}
                                </div>
                                <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {s.label}
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* Secondary footnote bar */}
                    <div style={{ borderTop: '1px solid var(--color-border)', padding: '5px 14px', display: 'flex', flexWrap: 'wrap', gap: '2px 18px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.71rem', color: 'var(--color-text-subtle)' }}>
                            {t.finOvCollectedFromRecipient}: <strong style={{ color: 'var(--color-text-muted)' }}>{gel(data.serviceCollectedFromRecipient)}</strong>
                        </span>
                        <span style={{ fontSize: '0.71rem', color: 'var(--color-text-subtle)' }}>
                            {t.finOvInvoicedToSenders}: <strong style={{ color: 'var(--color-text-muted)' }}>{gel(data.serviceInvoicedToSenders)}</strong>
                        </span>
                        <span style={{ fontSize: '0.71rem', color: 'var(--color-text-subtle)' }}>
                            {t.finOvCod}: <strong style={{ color: 'var(--color-text-muted)' }}>{gel(data.codPassThrough)}</strong>
                        </span>
                    </div>

                    {/* ── Cash position ────────────────────────────────────────── */}
                    <div style={{ borderTop: '4px solid var(--color-border)', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>
                                {t.finCashTitle}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>
                                {t.finCashAsOf} {data.to}
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '4px 28px' }}>
                            {/* Cash ledger → net position */}
                            <div>
                                <SignedRow label={t.finCashInFromCouriers}    value={data.cashInFromCouriers}   sign="+" />
                                <SignedRow label={t.finCashSenderServicePaid} value={data.senderServicePaid}    sign="+" />
                                <SignedRow label={t.finCashCodPaidOut}        value={data.codPaidToCustomers}   sign="−" />
                                <SignedRow label={t.finCashSalaryPaid}        value={data.salaryPaidToCouriers} sign="−" />
                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 2px', fontSize: '0.92rem' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{t.finCashOnHand}</span>
                                    <span style={{ fontWeight: 800, color: 'var(--color-accent)' }}>{gel(data.netCashPosition)}</span>
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>{t.finCashOnHandHint}</div>
                            </div>

                            {/* Outstanding balances */}
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', padding: '6px 0 2px' }}>{t.finCashOutTitle}</div>
                                <Row label={t.finCashCodOwed}           value={gel(data.outstandingCodOwedToCustomers)} tone="out" />
                                <Row label={t.finCashServiceReceivable} value={gel(data.outstandingServiceReceivable)}  tone="paid" />
                                <Row label={t.finCashSalaryOwed}        value={gel(data.outstandingSalaryOwed)}         tone="out" />
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

// ── Signed cash-ledger row (+ inflow / − outflow) ─────────────────────────────────

function SignedRow({ label, value, sign }: { label: string; value: number; sign: '+' | '−' }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 600, color: sign === '+' ? '#059669' : '#b45309' }}>{sign} {gel(value)}</span>
        </div>
    );
}

// ── Customer settlement — aggregate summary + COD payment with allocation ──────────

const round2 = (n: number) => Math.round(n * 100) / 100;

function CustomerInvoicesSection({ token, onPaid }: { token: string; onPaid: () => void }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);
    const [mode, setMode] = useState<'daily' | 'monthly'>('daily');
    const [date, setDate] = useState(isoDate(new Date())); // daily: a day; monthly: any day in the month; '' = all dates
    const [lines, setLines] = useState<OrderFinanceLine[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const load = useCallback(() => {
        if (!customer) { setLines([]); return; }
        setLoading(true); setError(null);
        fetchCustomerOrderFinance(customer.id, token, date || undefined, mode === 'monthly')
            .then(setLines)
            .catch(e => setError(e instanceof OrderFinanceApiError ? e.message : t.ofinErrLoad))
            .finally(() => setLoading(false));
    }, [customer, date, mode, token, t.ofinErrLoad]);

    useEffect(() => { load(); }, [load]);

    const todayStr = isoDate(new Date());
    const monthStr = todayStr.slice(0, 7);
    const shiftDay = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(base.getDate() + delta);
        return isoDate(base);
    });
    const shiftMonth = (delta: number) => setDate(prev => {
        const base = prev ? new Date(prev + 'T00:00:00') : new Date();
        base.setDate(1);
        base.setMonth(base.getMonth() + delta);
        return isoDate(base);
    });
    // Disable "next" once we're at (or past) the current day / month.
    const atToday = date !== '' && (mode === 'monthly' ? date.slice(0, 7) >= monthStr : date >= todayStr);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Toolbar: customer picker + delivery-date filter */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CustomerPicker
                        token={token}
                        selected={customer}
                        onSelect={setCustomer}
                        onClear={() => { setCustomer(null); setLines([]); setError(null); }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {/* Daily / Monthly toggle */}
                        <div className="go-seg" style={{ display: 'inline-flex' }}>
                            <button className={`go-seg__btn ${mode === 'daily' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('daily')}>{t.ofinViewDaily}</button>
                            <button className={`go-seg__btn ${mode === 'monthly' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('monthly')}>{t.ofinViewMonthly}</button>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.ofinFilterDelivered}</span>
                        {mode === 'daily' ? (
                            <>
                                <button onClick={() => shiftDay(-1)} title={t.statPrevDay} style={dateNavBtn}>‹</button>
                                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
                                <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay}
                                    style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                            </>
                        ) : (
                            <>
                                <button onClick={() => shiftMonth(-1)} title={t.ofinPrevMonth} style={dateNavBtn}>‹</button>
                                <input type="month" value={date ? date.slice(0, 7) : ''} max={monthStr}
                                    onChange={e => setDate(e.target.value ? e.target.value + '-01' : '')} style={dateInputStyle} />
                                <button onClick={() => !atToday && shiftMonth(1)} disabled={atToday} title={t.ofinNextMonth}
                                    style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                            </>
                        )}
                        {date && (
                            <button onClick={() => setDate('')} title={t.finAllDates}
                                style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {!customer ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {t.ofinSelectCustomer}
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : lines.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {!date ? t.ofinNoneAll : mode === 'monthly' ? t.ofinNoneMonth : t.ofinNoneDay}
                </div>
            ) : (
                <CustomerSettleCard
                    key={customer.id + '|' + mode + '|' + date}
                    customerId={customer.id}
                    lines={lines}
                    token={token}
                    onError={setError}
                    onChanged={() => { showToast(t.ofinSavedToast); load(); onPaid(); }}
                />
            )}

            {toast && (
                <div className="toast" role="status">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {toast}
                </div>
            )}
        </div>
    );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-text)' }}>{value}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        </div>
    );
}

type Sel = Record<string, { checked: boolean; amount: string }>;

interface FlowVM {
    payable: OrderFinanceLine[];
    owed: number;
    paid: number;
    selTotal: number;
    selCount: number;
    allChecked: boolean;
}

// One money flow's pay bar: select-all + selected total + Pay button.
function FlowBar({ f, payLabel, busy, onPay, onToggleAll, borderRight }: {
    f: FlowVM; payLabel: string; busy: boolean;
    onPay: () => void; onToggleAll: (check: boolean) => void; borderRight?: boolean;
}) {
    const { t } = useLanguage();
    const settled = f.owed <= 0.005;
    return (
        <div style={{ padding: '12px 14px', borderRight: borderRight ? '1px solid var(--color-border)' : undefined, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)', cursor: settled ? 'default' : 'pointer' }}>
                    <input type="checkbox" checked={f.allChecked} disabled={settled} onChange={e => onToggleAll(e.target.checked)}
                        style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: settled ? 'default' : 'pointer' }} />
                    {t.ofinSelectAll}
                </label>
                <button className="btn-primary" disabled={busy || f.selTotal <= 0.005} onClick={onPay}>{payLabel}</button>
            </div>
            <div style={{ fontSize: '0.72rem' }}>
                {settled
                    ? <span style={{ color: '#059669', fontWeight: 600 }}>{t.ofinAllSettled}</span>
                    : f.selCount > 0
                        ? <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{t.ofinSelectedTotal(gel(f.selTotal))}</span>
                        : <span style={{ color: 'var(--color-text-subtle)' }}>{t.ofinSelectToAllocate}</span>}
            </div>
        </div>
    );
}

// One order's amount field for a single flow — checkbox + editable price, always available.
function AllocCell({ applicable, outstanding, checked, amount, onToggle, onAmount }: {
    applicable: boolean; outstanding: number; checked: boolean; amount: string;
    onToggle: () => void; onAmount: (v: string) => void;
}) {
    const { t } = useLanguage();
    if (!applicable)
        return <div style={{ minWidth: 160, textAlign: 'right' }}><span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)' }}>{t.ofinRecipientPays}</span></div>;
    if (outstanding <= 0.005)
        return <div style={{ minWidth: 160, textAlign: 'right' }}><span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#059669' }}>{t.ofinPaid}</span></div>;

    return (
        <div style={{ minWidth: 160, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <input type="checkbox" checked={checked} onChange={onToggle}
                style={{ width: 15, height: 15, accentColor: 'var(--color-accent)', cursor: 'pointer', flexShrink: 0 }} />
            {/* Actual amount owed, always shown next to the editable field. */}
            <span title={t.ofinOutstandingCol} style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{gel(outstanding)}</span>
            <input type="number" min="0" step="0.01" max={outstanding}
                value={amount}
                onChange={e => onAmount(e.target.value)}
                style={{ width: 80, textAlign: 'right', background: checked ? 'var(--color-bg-3)' : 'transparent', border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.8rem', padding: '3px 6px', outline: 'none' }} />
        </div>
    );
}

function CustomerSettleCard({ customerId, lines, token, onError, onChanged }: {
    customerId: string;
    lines: OrderFinanceLine[];
    token: string;
    onError: (msg: string) => void;
    onChanged: () => void;
}) {
    const { t } = useLanguage();
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selCod, setSelCod] = useState<Sel>({});
    const [selSvc, setSelSvc] = useState<Sel>({});

    // Outstanding per order for each flow.
    const codOut = (o: OrderFinanceLine) => round2(Math.max(0, (o.codAmount ?? 0) - (o.codPaidToCustomerAmount ?? 0)));
    const svcOut = (o: OrderFinanceLine) => o.whoPaysForCompanyService === 'Sender'
        ? round2(Math.max(0, o.companyServicePrice - (o.servicePaidByCustomerAmount ?? 0)))
        : 0;

    // Displayed amount for a row (defaults to its full outstanding until edited).
    const amountOf = (sel: Sel, o: OrderFinanceLine, out: (o: OrderFinanceLine) => number) =>
        sel[o.orderId]?.amount ?? out(o).toFixed(2);

    const buildFlow = (sel: Sel, out: (o: OrderFinanceLine) => number, paidOf: (o: OrderFinanceLine) => number): FlowVM => {
        const payable = lines.filter(o => out(o) > 0.005);
        const owed = round2(payable.reduce((s, o) => s + out(o), 0));
        const paid = round2(lines.reduce((s, o) => s + paidOf(o), 0));
        const checked = payable.filter(o => sel[o.orderId]?.checked);
        const selTotal = round2(checked.reduce((s, o) => s + (Number(amountOf(sel, o, out)) || 0), 0));
        const allChecked = payable.length > 0 && checked.length === payable.length;
        return { payable, owed, paid, selTotal, selCount: checked.length, allChecked };
    };

    const cod = buildFlow(selCod, codOut, o => o.codPaidToCustomerAmount ?? 0);
    const svc = buildFlow(selSvc, svcOut, o => o.servicePaidByCustomerAmount ?? 0);

    const toggle = (setSel: React.Dispatch<React.SetStateAction<Sel>>, id: string, outstanding: number) =>
        setSel(prev => { const c = prev[id]; return { ...prev, [id]: { checked: !c?.checked, amount: c?.amount ?? outstanding.toFixed(2) } }; });
    // Editing a price also ticks the row so it's included in the payment.
    const setAmt = (setSel: React.Dispatch<React.SetStateAction<Sel>>, id: string, amount: string) =>
        setSel(prev => ({ ...prev, [id]: { checked: true, amount } }));
    const toggleAll = (setSel: React.Dispatch<React.SetStateAction<Sel>>, payable: OrderFinanceLine[], out: (o: OrderFinanceLine) => number, check: boolean) =>
        setSel(prev => {
            const next: Sel = { ...prev };
            for (const o of payable) next[o.orderId] = { checked: check, amount: prev[o.orderId]?.amount ?? out(o).toFixed(2) };
            return next;
        });

    const doPay = async (
        service: boolean, f: FlowVM, sel: Sel, out: (o: OrderFinanceLine) => number,
        resetSel: (s: Sel) => void,
    ) => {
        const chosen = f.payable.filter(o => sel[o.orderId]?.checked);
        if (chosen.length === 0) { onError(t.ofinErrSelectOrders); return; }
        for (const o of chosen) {
            const a = Number(amountOf(sel, o, out));
            if (isNaN(a) || a <= 0 || a > out(o) + 0.005) { onError(t.ofinErrAllocInvalid); return; }
        }
        const allocations = chosen.map(o => ({ orderId: o.orderId, amount: round2(Number(amountOf(sel, o, out))) }));

        setBusy(true);
        try {
            await payCustomerOrders(customerId, service, allocations, token);
            resetSel({});
            onChanged();
        } catch (e) {
            onError(e instanceof OrderFinanceApiError ? e.message : t.ofinErrAction);
        } finally {
            setBusy(false);
        }
    };

    const colLabel: React.CSSProperties = { minWidth: 120, textAlign: 'right', fontSize: '0.6rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' };

    return (
        <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Summary header (click to expand). Left = service (customer → company); right = COD (company → customer). */}
            <button onClick={() => setExpanded(x => !x)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 18 }}>
                        <Stat label={t.ofinServiceToCollect} value={gel(svc.owed)} />
                        <Stat label={t.ofinServicePaidLbl} value={gel(svc.paid)} />
                    </div>
                    <div style={{ display: 'flex', gap: 18 }}>
                        <Stat label={t.ofinCodToPay} value={gel(cod.owed)} accent />
                        <Stat label={t.ofinCodPaidLbl} value={gel(cod.paid)} />
                    </div>
                </div>
                <span style={{ fontSize: '1.2rem', color: 'var(--color-text-subtle)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </button>

            {/* Pay bars: service (left), COD (right) */}
            <div style={{ borderTop: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <FlowBar f={svc} payLabel={t.ofinPayService} busy={busy} borderRight
                    onToggleAll={check => toggleAll(setSelSvc, svc.payable, svcOut, check)}
                    onPay={() => doPay(true, svc, selSvc, svcOut, setSelSvc)} />
                <FlowBar f={cod} payLabel={t.ofinPayCod} busy={busy}
                    onToggleAll={check => toggleAll(setSelCod, cod.payable, codOut, check)}
                    onPay={() => doPay(false, cod, selCod, codOut, setSelCod)} />
            </div>

            {/* Expanded per-order list — each order always has a checkbox + price field for both flows */}
            {expanded && (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-2)' }}>
                        <div style={{ flex: '1 1 160px' }} />
                        <div style={colLabel}>{t.ofinColService}</div>
                        <div style={colLabel}>{t.ofinColCod}</div>
                    </div>
                    {lines.map(o => {
                        const so = svcOut(o);
                        const co = codOut(o);
                        const isSenderPays = o.whoPaysForCompanyService === 'Sender';
                        return (
                            <div key={o.orderId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--color-text)' }}>{o.trackingNumber}</span>
                                        <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: o.isReturn ? 'rgba(139,92,246,0.12)' : 'var(--color-accent-dim)', color: o.isReturn ? '#8b5cf6' : 'var(--color-accent)' }}>{o.orderType}</span>
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                        {recipientDisplayName(o.recipientName, t.recipientUnknown)}
                                    </div>
                                    {/* Full delivery address: city, district, street */}
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', marginTop: 1 }}>
                                        {[o.recipientCity, o.recipientDistrict, o.recipientAddress].filter(Boolean).join(', ')}
                                    </div>
                                    {/* Placement + delivery timestamps (Georgian wall-clock) */}
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: '0.68rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                                        <span>{t.ofinColPlaced}: <strong style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{formatGeorgianDateTime(o.createdAt)}</strong></span>
                                        <span>{t.ofinColDelivered}: <strong style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{o.deliveredAt ? formatGeorgianDateTime(o.deliveredAt) : t.ofinNotDelivered}</strong></span>
                                    </div>
                                </div>

                                {/* Service — customer → company (sender-pays only) */}
                                <AllocCell applicable={isSenderPays} outstanding={so}
                                    checked={selSvc[o.orderId]?.checked ?? false} amount={amountOf(selSvc, o, svcOut)}
                                    onToggle={() => toggle(setSelSvc, o.orderId, so)}
                                    onAmount={v => setAmt(setSelSvc, o.orderId, v)} />

                                {/* COD — company → customer */}
                                <AllocCell applicable={true} outstanding={co}
                                    checked={selCod[o.orderId]?.checked ?? false} amount={amountOf(selCod, o, codOut)}
                                    onToggle={() => toggle(setSelCod, o.orderId, co)}
                                    onAmount={v => setAmt(setSelCod, o.orderId, v)} />
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────────

export default function AdminFinancePage({ token }: { token: string }) {
    const { t } = useLanguage();
    const [tab, setTab] = useState<'customers' | 'couriers' | 'history'>('customers');
    // Bumped after a payment so the company cash-position card reloads without a refresh.
    const [overviewRefresh, setOverviewRefresh] = useState(0);
    const [showOutstanding, setShowOutstanding] = useState(false);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Company overview */}
            <CompanyOverviewCard token={token} refreshSignal={overviewRefresh} />

            {/* Tab bar + outstanding-balances launcher */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div className="go-seg" style={{ display: 'inline-flex' }}>
                    <button className={`go-seg__btn ${tab === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('customers')}>{t.finTabCustomers}</button>
                    <button className={`go-seg__btn ${tab === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('couriers')}>{t.finTabCouriers}</button>
                    <button className={`go-seg__btn ${tab === 'history'   ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('history')}>{t.finTabHistory}</button>
                </div>
                <button className="btn-primary" onClick={() => setShowOutstanding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t.finOutBtn}
                </button>
            </div>

            {tab === 'customers' && <CustomerInvoicesSection token={token} onPaid={() => setOverviewRefresh(k => k + 1)} />}
            {tab === 'couriers'  && <CourierSettlementsSection token={token} onSettled={() => setOverviewRefresh(k => k + 1)} />}
            {tab === 'history'   && <AdminFinanceHistoryTab token={token} />}

            {showOutstanding && (
                <OutstandingBalancesModal token={token} onClose={() => setShowOutstanding(false)} />
            )}
        </div>
    );
}

const dateInputStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.82rem',
    padding: '5px 8px', outline: 'none',
};

const dateNavBtn: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
    fontSize: '0.95rem', lineHeight: 1, padding: '5px 10px', cursor: 'pointer',
};
