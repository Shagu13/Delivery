import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import {
    fetchCustomerSettlements,
    recordCustomerSettlementPayment,
    CustomerSettlementApiError,
} from '../../api/customerSettlements';
import type { CustomerSettlement } from '../../api/customerSettlements';
import { fetchCompanyFinanceOverview, CompanyFinanceApiError } from '../../api/companyFinance';
import type { CompanyFinanceOverview } from '../../api/companyFinance';
import { CourierSettlementsSection } from './CourierSettlementsSection';
import { AdminFinanceHistoryTab } from './AdminFinanceHistoryTab';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// Outstanding: red when something is still owed, green once settled (0 or overpaid).
// Rounds to 2 decimals first so floating-point residue never shows red on a ₾0.00 row.
const outstandingTone = (n: number): 'red' | 'paid' => (Math.round(n * 100) > 0 ? 'red' : 'paid');

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
            getCustomers(token, 1, 15, search)
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
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.16)', maxHeight: 260, overflowY: 'auto' }}>
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

// ── Customer batch invoices — list + per-batch record payment ─────────────────────

function CustomerInvoicesSection({ token, onPaid }: { token: string; onPaid: () => void }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);
    const [date, setDate] = useState('');                 // '' = all dates
    const [invoices, setInvoices] = useState<CustomerSettlement[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

    const load = useCallback(() => {
        if (!customer) { setInvoices([]); return; }
        setLoading(true); setError(null);
        fetchCustomerSettlements(customer.id, token, date || undefined)
            .then(setInvoices)
            .catch(e => setError(e instanceof CustomerSettlementApiError ? e.message : t.finErrLoad))
            .finally(() => setLoading(false));
    }, [customer, date, token, t.finErrLoad]);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Toolbar: customer picker + date filter */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CustomerPicker
                        token={token}
                        selected={customer}
                        onSelect={setCustomer}
                        onClear={() => { setCustomer(null); setInvoices([]); setError(null); }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finFilterPlaced}</span>
                        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
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
                    {t.finSelectPrompt}
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : invoices.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finNoInvoices}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 12 }}>
                    {invoices.map(inv => (
                        <InvoiceCard
                            key={inv.id}
                            inv={inv}
                            token={token}
                            onError={setError}
                            onPaid={() => { showToast(t.finToastPaymentRecorded); load(); onPaid(); }}
                        />
                    ))}
                </div>
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

function InvoiceCard({ inv, token, onPaid, onError }: {
    inv: CustomerSettlement;
    token: string;
    onPaid: () => void;
    onError: (msg: string) => void;
}) {
    const { t } = useLanguage();
    const [cod, setCod] = useState('');
    const [svc, setSvc] = useState('');
    const [busy, setBusy] = useState(false);

    const record = async () => {
        const codN = cod.trim() ? Number(cod) : undefined;
        const svcN = svc.trim() ? Number(svc) : undefined;
        if (codN === undefined && svcN === undefined) { onError(t.finErrEnterAmount); return; }
        if ((codN !== undefined && (isNaN(codN) || codN <= 0)) || (svcN !== undefined && (isNaN(svcN) || svcN <= 0))) {
            onError(t.finErrPositive); return;
        }
        setBusy(true);
        try {
            await recordCustomerSettlementPayment(
                { settlementId: inv.id, codPaidByCompany: codN, servicePaidToCompany: svcN }, token);
            setCod(''); setSvc('');
            onPaid();
        } catch (e) {
            onError(e instanceof CustomerSettlementApiError ? e.message : t.finErrAction);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="content-card" style={{ padding: 16 }}>
            {/* Header: date, kind, packages */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-text)' }}>{new Date(inv.createdAt).toLocaleDateString()}</span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: inv.isReturn ? 'rgba(139,92,246,0.12)' : 'var(--color-accent-dim)', color: inv.isReturn ? '#8b5cf6' : 'var(--color-accent)' }}>
                        {inv.isReturn ? t.statReturnBadge : t.statBatchBadge}
                    </span>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.custPkg(inv.numberOfPackages)}</span>
            </div>

            {/* COD — company → customer */}
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 2 }}>{t.finCodDir}</div>
            <Row label={t.finCollected}   value={gel(inv.totalCODCompanyCollectedForPackages)} />
            <Row label={t.finPaid}        value={gel(inv.totalAmountOfCollectedCodPaidByCompany)} tone="paid" />
            <Row label={t.finOutstanding} value={gel(inv.outstandingCodOwedToCustomer)} tone={outstandingTone(inv.outstandingCodOwedToCustomer)} strong />

            {/* Service — customer → company */}
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '10px 0 2px' }}>{t.finServiceDir}</div>
            <Row label={t.finOwed}        value={gel(inv.totalCompanyServicePriceOwedToCompany)} />
            <Row label={t.finPaid}        value={gel(inv.totalAmountPaidToCompanyForCompanyService)} tone="paid" />
            <Row label={t.finOutstanding} value={gel(inv.outstandingServiceOwedToCompany)} tone={outstandingTone(inv.outstandingServiceOwedToCompany)} strong />

            {/* Record payment */}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 8 }}>{t.finRecordPayment}</div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t.finCodPaidLabel}</label>
                <input type="number" min="0" step="0.01" value={cod} onChange={e => setCod(e.target.value)} placeholder="0.00" style={inputStyle} />
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '8px 0 4px' }}>{t.finServicePaidLabel}</label>
                <input type="number" min="0" step="0.01" value={svc} onChange={e => setSvc(e.target.value)} placeholder="0.00" style={inputStyle} />
                <button className="btn-primary" onClick={record} disabled={busy} style={{ width: '100%', marginTop: 10 }}>
                    {busy ? t.finWorking : t.finRecordPayment}
                </button>
            </div>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────────

export default function AdminFinancePage({ token }: { token: string }) {
    const { t } = useLanguage();
    const [tab, setTab] = useState<'customers' | 'couriers' | 'history'>('customers');
    // Bumped after a payment so the company cash-position card reloads without a refresh.
    const [overviewRefresh, setOverviewRefresh] = useState(0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Company overview */}
            <CompanyOverviewCard token={token} refreshSignal={overviewRefresh} />

            {/* Tab bar — no wrapping card */}
            <div className="go-seg" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                <button className={`go-seg__btn ${tab === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('customers')}>{t.finTabCustomers}</button>
                <button className={`go-seg__btn ${tab === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('couriers')}>{t.finTabCouriers}</button>
                <button className={`go-seg__btn ${tab === 'history'   ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('history')}>{t.finTabHistory}</button>
            </div>

            {tab === 'customers' && <CustomerInvoicesSection token={token} onPaid={() => setOverviewRefresh(k => k + 1)} />}
            {tab === 'couriers'  && <CourierSettlementsSection token={token} />}
            {tab === 'history'   && <AdminFinanceHistoryTab token={token} />}
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: '100%', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.875rem',
    padding: '8px 10px', outline: 'none',
};

const dateInputStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.82rem',
    padding: '5px 8px', outline: 'none',
};
