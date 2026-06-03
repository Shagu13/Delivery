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

const gel = (n: number) => `₾${n.toFixed(2)}`;

// ── Customer search/select dropdown ─────────────────────────────────────────────

function CustomerPicker({ token, selected, onSelect }: {
    token: string;
    selected: AdminCustomer | null;
    onSelect: (c: AdminCustomer) => void;
}) {
    const { t } = useLanguage();
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<AdminCustomer[]>([]);
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

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
        <div ref={ref} style={{ position: 'relative', minWidth: 280, flex: 1 }}>
            <div className="go-search" style={{ maxWidth: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                <input
                    type="text"
                    placeholder={selected ? selected.businessName : t.finSearchCustomer}
                    value={search}
                    onChange={e => { setSearch(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    autoComplete="off"
                />
            </div>
            {open && results.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.16)', maxHeight: 280, overflowY: 'auto' }}>
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

// ── Company finance overview (live) ──────────────────────────────────────────────

function Tile({ label, value, accent = false, small = false, muted = false }: {
    label: string; value: string; accent?: boolean; small?: boolean; muted?: boolean;
}) {
    return (
        <div style={{ background: accent ? 'var(--color-accent-dim)' : 'var(--color-bg-2)', border: `1px solid ${accent ? 'rgba(196,127,23,0.25)' : 'var(--color-border)'}`, borderRadius: 10, padding: '12px', textAlign: 'center' }}>
            <div style={{ fontSize: small ? '0.95rem' : '1.15rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : muted ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{value}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--color-text-subtle)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        </div>
    );
}

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

    return (
        <div className="content-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>{t.finOvTitle}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.finOvFrom}</label>
                    <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
                    <label style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{t.finOvTo}</label>
                    <input type="date" value={to} min={from} max={isoDate(now)} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
                </div>
            </div>

            {error ? (
                <div className="dashboard__error" style={{ color: '#ef4444' }}>{error}</div>
            ) : loading || !data ? (
                <div style={{ padding: 24, textAlign: 'center' }}><div className="go-spinner" style={{ margin: '0 auto' }} /></div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                        <Tile label={t.finOvDelivered}      value={String(data.ordersDelivered)} />
                        <Tile label={t.finOvServiceRevenue} value={gel(data.serviceRevenue)} />
                        <Tile label={t.finOvCourierSalary}  value={gel(data.courierSalary)} />
                        <Tile label={t.finOvNetMargin}      value={gel(data.netOperatingMargin)} accent />
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                        <Tile label={t.finOvCollectedByRecipient} value={gel(data.serviceCollectedByRecipient)} small />
                        <Tile label={t.finOvInvoicedToSenders}    value={gel(data.serviceInvoicedToSenders)} small />
                        <Tile label={t.finOvCod}                  value={gel(data.codPassThrough)} small muted />
                    </div>
                    <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--color-text-subtle)', lineHeight: 1.5 }}>
                        <div>• {t.finOvNetHint}</div>
                        <div>• {t.finOvCodHint}</div>
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
    const [tab, setTab] = useState<'customers' | 'couriers'>('customers');
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Company-wide live overview */}
            <CompanyOverviewCard token={token} />

            {/* Settlement scope toggle */}
            <div className="content-card" style={{ padding: 12 }}>
                <div className="go-seg" style={{ display: 'inline-flex' }}>
                    <button className={`go-seg__btn ${tab === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('customers')}>{t.finTabCustomers}</button>
                    <button className={`go-seg__btn ${tab === 'couriers' ? 'go-seg__btn--active' : ''}`} onClick={() => setTab('couriers')}>{t.finTabCouriers}</button>
                </div>
            </div>

            {tab === 'couriers' && <CourierSettlementsSection token={token} />}

            {tab === 'customers' && (
              <>
            {/* Toolbar: customer + month */}
            <div className="content-card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <CustomerPicker token={token} selected={customer} onSelect={setCustomer} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button className="btn-ghost" onClick={() => goMonth(-1)}>‹</button>
                        <span style={{ fontWeight: 700, minWidth: 150, textAlign: 'center' }}>{period}</span>
                        <button className="btn-ghost" onClick={() => goMonth(1)} disabled={isFuture}>›</button>
                    </div>
                </div>
                {customer && (
                    <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                        {t.finSelected} <strong style={{ color: 'var(--color-text)' }}>{customer.businessName}</strong> ({customer.firstName} {customer.lastName})
                    </div>
                )}
            </div>

            {error && <div className="dashboard__error" style={{ color: '#ef4444' }}>{error}</div>}

            {!customer ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    {t.finSelectPrompt}
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : preview && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                    {/* Live computed figures + create/recompute */}
                    <div className="content-card" style={{ padding: 16 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 10 }}>
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
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 10 }}>
                                {t.finSavedBalances}
                            </div>

                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 2 }}>{t.finCodDir}</div>
                            <Row label={t.finCollected}   value={gel(existing.totalCODCompanyCollectedForPackages)} />
                            <Row label={t.finPaid}        value={gel(existing.totalAmountOfCollectedCodPaidByCompany)} tone="paid" />
                            <Row label={t.finOutstanding} value={gel(existing.outstandingCodOwedToCustomer)} tone="out" strong />

                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', margin: '12px 0 2px' }}>{t.finServiceDir}</div>
                            <Row label={t.finOwed}        value={gel(existing.totalCompanyServicePriceOwedToCompany)} />
                            <Row label={t.finPaid}        value={gel(existing.totalAmountPaidToCompanyForCompanyService)} tone="paid" />
                            <Row label={t.finOutstanding} value={gel(existing.outstandingServiceOwedToCompany)} tone="out" strong />

                            {/* Record payment */}
                            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 8 }}>{t.finRecordPayment}</div>
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>{t.finCodPaidLabel}</label>
                                <input type="number" min="0" step="0.01" value={codInput} onChange={e => setCodInput(e.target.value)}
                                    placeholder="0.00" style={inputStyle} />
                                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '10px 0 4px' }}>{t.finServicePaidLabel}</label>
                                <input type="number" min="0" step="0.01" value={serviceInput} onChange={e => setServiceInput(e.target.value)}
                                    placeholder="0.00" style={inputStyle} />
                                <button className="btn-primary" onClick={handleRecordPayment} disabled={busy} style={{ width: '100%', marginTop: 12 }}>
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
