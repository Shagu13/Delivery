import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import { fetchCustomerSettlements, CustomerSettlementApiError } from '../../api/customerSettlements';
import type { CustomerSettlement } from '../../api/customerSettlements';
import { fetchCourierSettlementsAdmin, SettlementApiError } from '../../api/settlements';
import type { AdminCourierSettlementItem } from '../../api/settlements';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// ── Shared compact summary chip ────────────────────────────────────────────────

function SummaryChip({ label, value, tone = 'neutral' }: {
    label: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'accent';
}) {
    const bg =
        tone === 'good'   ? 'rgba(5,150,105,0.08)'  :
        tone === 'warn'   ? 'rgba(180,83,9,0.08)'   :
        tone === 'accent' ? 'var(--color-accent-dim)' :
        'var(--color-bg-3)';
    const color =
        tone === 'good'   ? '#059669' :
        tone === 'warn'   ? '#b45309' :
        tone === 'accent' ? 'var(--color-accent)' :
        'var(--color-text)';
    return (
        <div style={{ padding: '7px 12px', background: bg, border: `1px solid var(--color-border)`, borderRadius: 'var(--radius-sm)', textAlign: 'center', minWidth: 120 }}>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: '0.63rem', color: 'var(--color-text-subtle)', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        </div>
    );
}

// ── Customer picker (inline, reused from Finance page) ────────────────────────

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

    useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

    useEffect(() => {
        if (debounce.current) clearTimeout(debounce.current);
        debounce.current = setTimeout(() => {
            getCustomers(token, 1, 15, search).then(r => setResults(r.items)).catch(() => setResults([]));
        }, 300);
        return () => { if (debounce.current) clearTimeout(debounce.current); };
    }, [token, search]);

    return (
        <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 380 }}>
            {selected && !open ? (
                <div onClick={() => { setOpen(true); setSearch(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'text', minHeight: 36 }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--color-text-subtle)' }}>
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.83rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.businessName}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.firstName} {selected.lastName} · {selected.phoneNumber}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onClear(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', padding: '2px 5px', borderRadius: 4, fontSize: '1.05rem', lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
            ) : (
                <div className="go-search" style={{ maxWidth: 'none' }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <input ref={inputRef} type="text" placeholder={t.finSearchCustomer} value={search}
                        onChange={e => { setSearch(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)} autoComplete="off" />
                </div>
            )}
            {open && results.length > 0 && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 8px 28px rgba(0,0,0,0.16)', maxHeight: 260, overflowY: 'auto' }}>
                    {results.map(c => (
                        <button key={c.id} onClick={() => { onSelect(c); setOpen(false); setSearch(''); }}
                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', background: selected?.id === c.id ? 'var(--color-accent-dim)' : 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text)' }}>{c.businessName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{c.firstName} {c.lastName} · {c.phoneNumber}</div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── Table header cell ──────────────────────────────────────────────────────────

function TH({ children }: { children: React.ReactNode }) {
    return (
        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
            {children}
        </th>
    );
}

function TD({ children, color, bold }: { children: React.ReactNode; color?: string; bold?: boolean }) {
    return (
        <td style={{ padding: '9px 12px', fontSize: '0.82rem', color: color ?? 'var(--color-text)', fontWeight: bold ? 700 : 400, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
            {children}
        </td>
    );
}

// ── Customer payment ledger ────────────────────────────────────────────────────

function CustomerLedger({ token }: { token: string }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);
    const [records, setRecords] = useState<CustomerSettlement[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        if (!customer) return;
        setLoading(true); setError(null);
        fetchCustomerSettlements(customer.id, token)
            .then(setRecords)
            .catch(e => setError(e instanceof CustomerSettlementApiError ? e.message : t.finErrLoad))
            .finally(() => setLoading(false));
    }, [customer, token, t.finErrLoad]);

    useEffect(() => { load(); }, [load]);

    const totalCodOut = records.reduce((s, r) => s + r.outstandingCodOwedToCustomer, 0);
    const totalSvcOut = records.reduce((s, r) => s + r.outstandingServiceOwedToCompany, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Picker */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
                <CustomerPicker token={token} selected={customer} onSelect={setCustomer} onClear={() => { setCustomer(null); setRecords([]); setError(null); }} />
            </div>

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {!customer ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finHisSelectCustomer}
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : records.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finNoSaved}
                </div>
            ) : (
                <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Title + summary */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            {t.finHisCustomerTitle(customer.businessName)}
                        </span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <SummaryChip label={t.finHisCodOutstanding}    value={gel(totalCodOut)} tone={totalCodOut > 0 ? 'warn' : 'good'} />
                            <SummaryChip label={t.finHisServiceOutstanding} value={gel(totalSvcOut)} tone={totalSvcOut > 0 ? 'warn' : 'good'} />
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                            <thead>
                                <tr>
                                    <TH>{t.finThMonth}</TH>
                                    <TH>{t.finThDelivered}</TH>
                                    <TH>{t.finHisThCodOwed}</TH>
                                    <TH>{t.finHisThCodPaid}</TH>
                                    <TH>{t.finHisThCodOut}</TH>
                                    <TH>{t.finHisThSvcOwed}</TH>
                                    <TH>{t.finHisThSvcPaid}</TH>
                                    <TH>{t.finHisThSvcOut}</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => {
                                    const codOut = r.outstandingCodOwedToCustomer;
                                    const svcOut = r.outstandingServiceOwedToCompany;
                                    return (
                                        <tr key={r.id}>
                                            <TD bold>{t.finMonths[r.month - 1]} {r.year}</TD>
                                            <TD>{r.totalNumberOfOrderDelivered}</TD>
                                            <TD>{gel(r.totalCODCompanyCollectedForPackages)}</TD>
                                            <TD color="#059669">{gel(r.totalAmountOfCollectedCodPaidByCompany)}</TD>
                                            <TD color={codOut > 0 ? '#b45309' : '#059669'} bold={codOut > 0}>{gel(codOut)}</TD>
                                            <TD>{gel(r.totalCompanyServicePriceOwedToCompany)}</TD>
                                            <TD color="#059669">{gel(r.totalAmountPaidToCompanyForCompanyService)}</TD>
                                            <TD color={svcOut > 0 ? '#b45309' : '#059669'} bold={svcOut > 0}>{gel(svcOut)}</TD>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Courier salary history ─────────────────────────────────────────────────────

function CourierLedger({ token }: { token: string }) {
    const { t } = useLanguage();
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [records, setRecords] = useState<AdminCourierSettlementItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchCouriers(token).then(setCouriers).catch(() => setCouriers([]));
    }, [token]);

    const load = useCallback(() => {
        if (!selectedId) return;
        setLoading(true); setError(null);
        fetchCourierSettlementsAdmin(selectedId, token)
            .then(setRecords)
            .catch(e => setError(e instanceof SettlementApiError ? e.message : t.finErrLoad))
            .finally(() => setLoading(false));
    }, [selectedId, token, t.finErrLoad]);

    useEffect(() => { load(); }, [load]);

    const selectedCourier = couriers.find(c => c.courierId === selectedId) ?? null;
    const totalSalary = records.reduce((s, r) => s + r.totalCourierSalary, 0);
    const totalPaid   = records.reduce((s, r) => s + r.amountCourierWasPaid, 0);
    const totalUnpaid = totalSalary - totalPaid;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Picker */}
            <div className="content-card" style={{ padding: '10px 14px' }}>
                <select
                    className="go-select"
                    value={selectedId}
                    onChange={e => { setSelectedId(e.target.value); setRecords([]); }}
                    style={{ minWidth: 240, maxWidth: 380 }}
                >
                    <option value="">{t.finCourierSelect}</option>
                    {couriers.map(c => (
                        <option key={c.courierId} value={c.courierId}>
                            {c.fullName}{c.isDeleted ? ' (inactive)' : ''}
                        </option>
                    ))}
                </select>
            </div>

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {!selectedId ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finHisSelectCourier}
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : records.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finNoSaved}
                </div>
            ) : (
                <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Title + summary chips */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            {t.finHisCourierTitle(selectedCourier?.fullName ?? '')}
                        </span>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <SummaryChip label={t.finHisTotalSalary} value={gel(totalSalary)} />
                            <SummaryChip label={t.finHisTotalPaid}   value={gel(totalPaid)}   tone="good" />
                            <SummaryChip label={t.finHisTotalUnpaid} value={gel(totalUnpaid)} tone={totalUnpaid > 0 ? 'warn' : 'good'} />
                        </div>
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                            <thead>
                                <tr>
                                    <TH>{t.finHisThDate}</TH>
                                    <TH>{t.finHisThDelivered}</TH>
                                    <TH>{t.finHisThCash}</TH>
                                    <TH>{t.finHisThSalary}</TH>
                                    <TH>{t.finHisThPaid}</TH>
                                    <TH>{t.finHisThOutstanding}</TH>
                                    <TH>{t.finHisThTransfer}</TH>
                                    <TH>{t.finHisThStatus}</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map(r => {
                                    const unpaid = r.totalCourierSalary - r.amountCourierWasPaid;
                                    return (
                                        <tr key={r.id}>
                                            <TD bold>{r.date}</TD>
                                            <TD>{r.totalOrdersDelivered}</TD>
                                            <TD>{gel(r.totalAmountOfCashCollected)}</TD>
                                            <TD>{gel(r.totalCourierSalary)}</TD>
                                            <TD color="#059669">{gel(r.amountCourierWasPaid)}</TD>
                                            <TD color={unpaid > 0 ? '#b45309' : '#059669'} bold={unpaid > 0}>{gel(unpaid)}</TD>
                                            <TD>{gel(r.totalCourierTransferToCompany)}</TD>
                                            <TD>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                                                    borderRadius: 100, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                                                    background: r.isTheDayClosed ? 'rgba(5,150,105,0.1)' : 'rgba(180,83,9,0.08)',
                                                    color: r.isTheDayClosed ? '#059669' : '#b45309',
                                                    border: `1px solid ${r.isTheDayClosed ? 'rgba(5,150,105,0.2)' : 'rgba(180,83,9,0.2)'}`,
                                                }}>
                                                    {r.isTheDayClosed ? t.finHisClosed : t.finHisOpen}
                                                </span>
                                            </TD>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── History tab root ───────────────────────────────────────────────────────────

export function AdminFinanceHistoryTab({ token }: { token: string }) {
    const { t } = useLanguage();
    const [view, setView] = useState<'customers' | 'couriers'>('customers');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="go-seg" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                <button className={`go-seg__btn ${view === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setView('customers')}>{t.finTabCustomers}</button>
                <button className={`go-seg__btn ${view === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setView('couriers')}>{t.finTabCouriers}</button>
            </div>

            {view === 'customers' && <CustomerLedger token={token} />}
            {view === 'couriers'  && <CourierLedger  token={token} />}
        </div>
    );
}
