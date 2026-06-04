import { useEffect, useState, useCallback, useRef } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import {
    fetchCustomerSettlementPreview,
    fetchCustomerSettlements,
    createCustomerSettlement,
    recomputeCustomerSettlement,
    recordCustomerSettlementPayment,
    CustomerSettlementApiError,
} from '../../api/customerSettlements';
import type { CustomerSettlement, CustomerSettlementPreview } from '../../api/customerSettlements';
import { fetchCompanyFinanceOverview, CompanyFinanceApiError } from '../../api/companyFinance';
import type { CompanyFinanceOverview } from '../../api/companyFinance';
import { CourierSettlementsSection } from './CourierSettlementsSection';
import { AdminFinanceHistoryTab } from './AdminFinanceHistoryTab';

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
    label: string; value: string; strong?: boolean; tone?: 'paid' | 'out';
}) {
    const color = tone === 'paid' ? '#059669' : tone === 'out' ? '#b45309' : 'var(--color-text)';
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ fontWeight: strong ? 800 : 600, color }}>{value}</span>
        </div>
    );
}

// ── Company finance overview ──────────────────────────────────────────────────

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function CompanyOverviewCard({ token }: { token: string }) {
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

    useEffect(() => { load(); }, [load]);

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
                </>
            )}
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────────

export default function AdminFinancePage({ token }: { token: string }) {
    const { t } = useLanguage();
    const now = new Date();
    const [tab, setTab] = useState<'customers' | 'couriers' | 'history'>('customers');
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);

    const [preview, setPreview] = useState<CustomerSettlementPreview | null>(null);
    const [history, setHistory] = useState<CustomerSettlement[]>([]);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);

    const [codInput, setCodInput] = useState('');
    const [serviceInput, setServiceInput] = useState('');

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

    const loadPreview = useCallback(() => {
        if (!customer) return;
        setLoading(true); setError(null);
        Promise.all([
            fetchCustomerSettlementPreview(customer.id, year, month, token),
            fetchCustomerSettlements(customer.id, token),
        ])
            .then(([p, h]) => { setPreview(p); setHistory(h); })
            .catch((e) => setError(e instanceof CustomerSettlementApiError ? e.message : t.finErrLoad))
            .finally(() => setLoading(false));
    }, [customer, year, month, token, t.finErrLoad]);

    useEffect(() => { loadPreview(); }, [loadPreview]);

    const goMonth = (delta: number) => {
        let m = month + delta, y = year;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }
        setMonth(m); setYear(y);
    };

    const existing = preview?.existingSettlement ?? null;
    const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);
    const period = `${t.finMonths[month - 1]} ${year}`;

    const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
        setBusy(true); setError(null);
        try {
            await fn();
            showToast(successMsg);
            loadPreview();
        } catch (e) {
            setError(e instanceof CustomerSettlementApiError ? e.message : t.finErrAction);
        } finally {
            setBusy(false);
        }
    };

    const handleCreate = () => customer && runAction(
        () => createCustomerSettlement({ customerId: customer.id, year, month }, token),
        t.finToastCreated,
    );

    const handleRecompute = () => customer && runAction(
        () => recomputeCustomerSettlement({ customerId: customer.id, year, month }, token),
        t.finToastRecomputed,
    );

    const handleRecordPayment = () => {
        if (!customer) return;
        const cod = codInput.trim() ? Number(codInput) : undefined;
        const service = serviceInput.trim() ? Number(serviceInput) : undefined;
        if (cod === undefined && service === undefined) { setError(t.finErrEnterAmount); return; }
        if ((cod !== undefined && (isNaN(cod) || cod <= 0)) || (service !== undefined && (isNaN(service) || service <= 0))) {
            setError(t.finErrPositive); return;
        }
        runAction(
            () => recordCustomerSettlementPayment(
                { customerId: customer.id, year, month, codPaidByCompany: cod, servicePaidToCompany: service }, token),
            t.finToastPaymentRecorded,
        ).then(() => { setCodInput(''); setServiceInput(''); });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Company overview */}
            <CompanyOverviewCard token={token} />

            {/* Tab bar — no wrapping card */}
            <div className="go-seg" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                <button className={`go-seg__btn ${tab === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('customers')}>{t.finTabCustomers}</button>
                <button className={`go-seg__btn ${tab === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('couriers')}>{t.finTabCouriers}</button>
                <button className={`go-seg__btn ${tab === 'history'   ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('history')}>{t.finTabHistory}</button>
            </div>

            {tab === 'couriers' && <CourierSettlementsSection token={token} />}
            {tab === 'history'  && <AdminFinanceHistoryTab token={token} />}

            {tab === 'customers' && (
                <>
                    {/* Toolbar: customer picker + period nav in one row */}
                    <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <CustomerPicker
                                token={token}
                                selected={customer}
                                onSelect={setCustomer}
                                onClear={() => { setCustomer(null); setPreview(null); setHistory([]); setError(null); }}
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
                                <button onClick={() => goMonth(-1)} style={navBtnStyle}>‹</button>
                                <span style={{ fontWeight: 700, minWidth: 126, textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text)', userSelect: 'none' }}>{period}</span>
                                <button onClick={() => goMonth(1)} disabled={isFuture} style={{ ...navBtnStyle, opacity: isFuture ? 0.35 : 1 }}>›</button>
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
                    ) : preview && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
                            {/* Live figures */}
                            <div className="content-card" style={{ padding: 16 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 10 }}>
                                    {t.finLiveFigures(period)}
                                </div>
                                <Row label={t.finOrdersPlaced}     value={String(preview.ordersPlaced)} />
                                <Row label={t.finOrdersDelivered}  value={String(preview.ordersDelivered)} />
                                <Row label={t.finCodCollected}     value={gel(preview.codCollectedForPackages)} />
                                <Row label={t.finServicePriceOwed} value={gel(preview.companyServicePriceOwed)} strong />
                                <div style={{ marginTop: 14 }}>
                                    {existing ? (
                                        <button className="btn-primary" onClick={handleRecompute} disabled={busy} style={{ width: '100%' }}>
                                            {busy ? t.finWorking : t.finRecompute}
                                        </button>
                                    ) : (
                                        <button className="btn-primary" onClick={handleCreate} disabled={busy || isFuture} style={{ width: '100%' }}>
                                            {busy ? t.finWorking : t.finCreate}
                                        </button>
                                    )}
                                    {!existing && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)', marginTop: 6 }}>
                                            {t.finNoSaved}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Saved settlement: balances + record payment */}
                            {existing ? (
                                <div className="content-card" style={{ padding: 16 }}>
                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 10 }}>
                                        {t.finSavedBalances}
                                    </div>

                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 2 }}>{t.finCodDir}</div>
                                    <Row label={t.finCollected}   value={gel(existing.totalCODCompanyCollectedForPackages)} />
                                    <Row label={t.finPaid}        value={gel(existing.totalAmountOfCollectedCodPaidByCompany)} tone="paid" />
                                    <Row label={t.finOutstanding} value={gel(existing.outstandingCodOwedToCustomer)} tone="out" strong />

                                    <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '10px 0 2px' }}>{t.finServiceDir}</div>
                                    <Row label={t.finOwed}        value={gel(existing.totalCompanyServicePriceOwedToCompany)} />
                                    <Row label={t.finPaid}        value={gel(existing.totalAmountPaidToCompanyForCompanyService)} tone="paid" />
                                    <Row label={t.finOutstanding} value={gel(existing.outstandingServiceOwedToCompany)} tone="out" strong />

                                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                                        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 8 }}>{t.finRecordPayment}</div>
                                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t.finCodPaidLabel}</label>
                                        <input type="number" min="0" step="0.01" value={codInput} onChange={e => setCodInput(e.target.value)} placeholder="0.00" style={inputStyle} />
                                        <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '8px 0 4px' }}>{t.finServicePaidLabel}</label>
                                        <input type="number" min="0" step="0.01" value={serviceInput} onChange={e => setServiceInput(e.target.value)} placeholder="0.00" style={inputStyle} />
                                        <button className="btn-primary" onClick={handleRecordPayment} disabled={busy} style={{ width: '100%', marginTop: 10 }}>
                                            {busy ? t.finWorking : t.finRecordPayment}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="content-card" style={{ padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
                                    {t.finCreateFirst}
                                </div>
                            )}
                        </div>
                    )}

                    {/* History */}
                    {customer && history.length > 0 && (
                        <div className="content-card">
                            <div className="content-card__header">
                                <span className="content-card__title">{t.finHistoryTitle(customer.businessName)}</span>
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: 720 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            {[t.finThMonth, t.finThPlaced, t.finThDelivered, t.finThCodOwed, t.finThCodPaid, t.finThServiceOwed, t.finThServicePaid].map(h => (
                                                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {history.map(s => (
                                            <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '10px 14px', fontWeight: 600 }}>{t.finMonths[s.month - 1]} {s.year}</td>
                                                <td style={{ padding: '10px 14px' }}>{s.totalNumberOfOrdersPlaced}</td>
                                                <td style={{ padding: '10px 14px' }}>{s.totalNumberOfOrderDelivered}</td>
                                                <td style={{ padding: '10px 14px' }}>{gel(s.totalCODCompanyCollectedForPackages)}</td>
                                                <td style={{ padding: '10px 14px', color: '#059669' }}>{gel(s.totalAmountOfCollectedCodPaidByCompany)}</td>
                                                <td style={{ padding: '10px 14px' }}>{gel(s.totalCompanyServicePriceOwedToCompany)}</td>
                                                <td style={{ padding: '10px 14px', color: '#059669' }}>{gel(s.totalAmountPaidToCompanyForCompanyService)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
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

const navBtnStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
    width: 30, height: 30, cursor: 'pointer', fontSize: '1.1rem',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background var(--transition)',
};

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
