import { Fragment, useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { getCustomers } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import { fetchCouriers } from '../../api/couriers';
import { fetchCustomerSettlements, CustomerSettlementApiError } from '../../api/customerSettlements';
import { fetchCourierSettlementsAdmin, SettlementApiError } from '../../api/settlements';
import { fetchCustomerPaymentReceipts, OrderFinanceApiError } from '../../api/orderFinance';
import { CourierPaymentReceiptsPanel } from '../../components/ui/CourierPaymentReceiptsPanel';

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
            getCustomers(token, 1, 50, search).then(r => setResults(r.items)).catch(() => setResults([]));
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
                <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', boxShadow: '0 -8px 28px rgba(0,0,0,0.16)', maxHeight: 260, overflowY: 'auto' }}>
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

function TH({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' | 'center' }) {
    return (
        <th style={{ padding: '9px 12px', textAlign: align ?? 'left', fontWeight: 700, fontSize: '0.65rem', letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap', background: 'var(--color-bg-3)', borderBottom: '1px solid var(--color-border)' }}>
            {children}
        </th>
    );
}

function TD({ children, color, bold, align, colSpan }: { children: React.ReactNode; color?: string; bold?: boolean; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
    return (
        <td colSpan={colSpan} style={{ padding: '9px 12px', fontSize: '0.82rem', color: color ?? 'var(--color-text)', fontWeight: bold ? 700 : 400, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap', textAlign: align ?? 'left' }}>
            {children}
        </td>
    );
}

// ── Customer payment ledger ────────────────────────────────────────────────────

function CustomerLedger({ token }: { token: string }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);

    const recordsQuery = useQuery({
        queryKey: ['admin', 'finance', 'customerLedger', customer?.id] as const,
        queryFn: () => fetchCustomerSettlements(customer!.id, token),
        enabled: !!token && !!customer,
    });
    const records = customer ? (recordsQuery.data ?? []) : [];
    const loading = customer ? recordsQuery.isPending : false;
    const error = customer && recordsQuery.isError
        ? (recordsQuery.error instanceof CustomerSettlementApiError ? recordsQuery.error.message : t.finErrLoad)
        : null;

    const totalCodOut = records.reduce((s, r) => s + r.outstandingCodOwedToCustomer, 0);
    const totalSvcOut = records.reduce((s, r) => s + r.outstandingServiceOwedToCompany, 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Picker */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5 }}>
                <CustomerPicker token={token} selected={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} />
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
                                    <TH>{t.finHisThDate}</TH>
                                    <TH>{t.finHisThPackages}</TH>
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
                                            <TD bold>{new Date(r.createdAt).toLocaleDateString()}</TD>
                                            <TD>{r.numberOfPackages}</TD>
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

    const couriersQuery = useQuery({
        queryKey: ['admin', 'couriers'] as const,
        queryFn: () => fetchCouriers(token),
        enabled: !!token,
    });
    const couriers = couriersQuery.data ?? [];

    const [selectedId, setSelectedId] = useState('');

    const recordsQuery = useQuery({
        queryKey: ['admin', 'finance', 'courierLedger', selectedId] as const,
        queryFn: () => fetchCourierSettlementsAdmin(selectedId, token),
        enabled: !!token && !!selectedId,
    });
    const records = selectedId ? (recordsQuery.data ?? []) : [];
    const loading = selectedId ? recordsQuery.isPending : false;
    const error = selectedId && recordsQuery.isError
        ? (recordsQuery.error instanceof SettlementApiError ? recordsQuery.error.message : t.finErrLoad)
        : null;

    const selectedCourier = couriers.find(c => c.courierId === selectedId) ?? null;
    const totalSalary = records.reduce((s, r) => s + r.totalCourierSalary, 0);
    const totalPaid   = records.reduce((s, r) => s + r.totalCourierSalaryPaid, 0);
    const totalUnpaid = totalSalary - totalPaid;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Picker */}
            <div className="content-card" style={{ padding: '10px 14px' }}>
                <select
                    className="go-select"
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
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
                                    const unpaid = r.totalCourierSalary - r.totalCourierSalaryPaid;
                                    const settled = unpaid <= 0.005;
                                    return (
                                        <tr key={r.date}>
                                            <TD bold>
                                                {r.date}
                                                {r.dateBasis === 'Assigned' && (
                                                    <span style={{ marginLeft: 6, fontSize: '0.66rem', fontWeight: 700, color: 'var(--color-text-subtle)' }}>{t.finHisAssignedTag}</span>
                                                )}
                                            </TD>
                                            <TD>{r.dateBasis === 'Assigned' ? `${r.totalOrdersDelivered} / ${r.totalOrdersAssigned}` : r.totalOrdersDelivered}</TD>
                                            <TD>{gel(r.totalAmountOfCashCollected)}</TD>
                                            <TD>{gel(r.totalCourierSalary)}</TD>
                                            <TD color="#059669">{gel(r.totalCourierSalaryPaid)}</TD>
                                            <TD color={unpaid > 0 ? '#b45309' : '#059669'} bold={unpaid > 0}>{gel(unpaid)}</TD>
                                            <TD>{gel(r.totalCourierTransferToCompany)}</TD>
                                            <TD>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', padding: '2px 8px',
                                                    borderRadius: 100, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em',
                                                    background: settled ? 'rgba(5,150,105,0.1)' : 'rgba(180,83,9,0.08)',
                                                    color: settled ? '#059669' : '#b45309',
                                                    border: `1px solid ${settled ? 'rgba(5,150,105,0.2)' : 'rgba(180,83,9,0.2)'}`,
                                                }}>
                                                    {settled ? t.finHisClosed : t.finHisOpen}
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

// ── Payment history: what the company paid/collected, by date ─────────────────

const dateInputStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.82rem',
    padding: '5px 8px', outline: 'none',
};

const dateNavBtn: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.95rem',
    width: 28, height: 28, cursor: 'pointer', lineHeight: 1,
};

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isoToday = () => isoDate(new Date());

function PaymentReceiptsSection({ token }: { token: string }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<AdminCustomer | null>(null);
    const [mode, setMode] = useState<'day' | 'month' | 'range'>('month');
    const [date, setDate] = useState(isoToday());
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const receiptsOpts = mode === 'range'
        ? { from: from || undefined, to: to || undefined }
        : { date: date || undefined, monthly: mode === 'month' };

    const receiptsQuery = useQuery({
        queryKey: ['admin', 'finance', 'paymentReceipts', customer?.id, mode, date, from, to] as const,
        queryFn: () => fetchCustomerPaymentReceipts(customer!.id, token, receiptsOpts),
        enabled: !!token && !!customer,
    });
    const receipts = customer ? (receiptsQuery.data ?? []) : [];
    const loading = customer ? receiptsQuery.isPending : false;
    const error = customer && receiptsQuery.isError
        ? (receiptsQuery.error instanceof OrderFinanceApiError ? receiptsQuery.error.message : t.finErrLoad)
        : null;

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
    const atToday = mode === 'month' ? date.slice(0, 7) >= isoToday().slice(0, 7) : date >= isoToday();

    const totalCod = receipts.filter(r => !r.isService).reduce((s, r) => s + r.totalAmount, 0);
    const totalService = receipts.filter(r => r.isService).reduce((s, r) => s + r.totalAmount, 0);
    const totalNetPaid = totalCod - totalService;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Picker + date filter */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <CustomerPicker token={token} selected={customer} onSelect={setCustomer} onClear={() => setCustomer(null)} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    <div className="go-seg" style={{ display: 'inline-flex' }}>
                        <button className={`go-seg__btn ${mode === 'day' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('day')}>{t.ofinViewDaily}</button>
                        <button className={`go-seg__btn ${mode === 'month' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('month')}>{t.ofinViewMonthly}</button>
                        <button className={`go-seg__btn ${mode === 'range' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('range')}>{t.ofinViewRange}</button>
                    </div>
                    {mode === 'day' && (
                        <>
                            <button onClick={() => shiftDay(-1)} title={t.statPrevDay} style={dateNavBtn}>‹</button>
                            <input type="date" value={date} max={isoToday()} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
                            <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay}
                                style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                        </>
                    )}
                    {mode === 'month' && (
                        <>
                            <button onClick={() => shiftMonth(-1)} title={t.ofinPrevMonth} style={dateNavBtn}>‹</button>
                            <input type="month" value={date.slice(0, 7)} max={isoToday().slice(0, 7)}
                                onChange={e => setDate(e.target.value ? e.target.value + '-01' : '')} style={dateInputStyle} />
                            <button onClick={() => !atToday && shiftMonth(1)} disabled={atToday} title={t.ofinNextMonth}
                                style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                        </>
                    )}
                    {mode === 'range' && (
                        <>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvFrom}</span>
                            <input type="date" value={from} max={to || isoToday()} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvTo}</span>
                            <input type="date" value={to} min={from || undefined} max={isoToday()} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
                        </>
                    )}
                </div>
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
            ) : receipts.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finPayHistNone}
                </div>
            ) : (
                <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
                    {/* Summary totals over the visible receipts */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <SummaryChip label={t.finPayHistCodTotal} value={gel(totalCod)} tone="good" />
                        <SummaryChip label={t.finPayHistServiceTotal} value={gel(totalService)} tone="accent" />
                        <SummaryChip label={t.finPayHistNetPaid} value={gel(totalNetPaid)} tone="good" />
                    </div>

                    {/* Receipt grid, Excel-style, with a totals footer row */}
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
                            <thead>
                                <tr>
                                    <TH align="center">#</TH>
                                    <TH>{t.finPayHistThDate}</TH>
                                    <TH>{t.finPayHistThType}</TH>
                                    <TH align="right">{t.finPayHistThOrders}</TH>
                                    <TH align="right">{t.finPayHistCodTotal}</TH>
                                    <TH align="right">{t.finPayHistServiceTotal}</TH>
                                    <TH> </TH>
                                </tr>
                            </thead>
                            <tbody>
                                {receipts.map((r, i) => {
                                    const expanded = expandedId === r.id;
                                    return (
                                        <Fragment key={r.id}>
                                            <tr onClick={() => setExpandedId(expanded ? null : r.id)} style={{ cursor: 'pointer' }}>
                                                <TD align="center" color="var(--color-text-subtle)">{i + 1}</TD>
                                                <TD bold>{new Date(r.paidAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'numeric', day: 'numeric' })}</TD>
                                                <TD>
                                                    <span style={{
                                                        fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 100,
                                                        background: r.isService ? 'var(--color-accent-dim)' : 'rgba(5,150,105,0.1)',
                                                        color: r.isService ? 'var(--color-accent)' : '#059669',
                                                        border: `1px solid ${r.isService ? 'var(--color-accent)' : 'rgba(5,150,105,0.2)'}`,
                                                    }}>
                                                        {r.isService ? t.finPayHistService : t.finPayHistCod}
                                                    </span>
                                                </TD>
                                                <TD align="right">{r.orders.length}</TD>
                                                <TD align="right" bold>{!r.isService ? gel(r.totalAmount) : <span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>—</span>}</TD>
                                                <TD align="right" bold>{r.isService ? gel(r.totalAmount) : <span style={{ color: 'var(--color-text-subtle)', fontWeight: 400 }}>—</span>}</TD>
                                                <TD align="center" color="var(--color-text-subtle)">
                                                    <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                                                </TD>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--color-border)' }}>
                                                        <div style={{ overflowX: 'auto', padding: '0 14px 12px' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                                                                <thead>
                                                                    <tr>
                                                                        <TH>{t.finPayHistThTracking}</TH>
                                                                        <TH>{t.finPayHistThRecipient}</TH>
                                                                        <TH>{t.finPayHistThAddress}</TH>
                                                                        <TH>{t.finPayHistThDelivered}</TH>
                                                                        <TH>{t.finPayHistThCourier}</TH>
                                                                        <TH align="right">{t.finPayHistThAmount}</TH>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {r.orders.map(o => (
                                                                        <tr key={o.orderId}>
                                                                            <TD>{o.trackingNumber}</TD>
                                                                            <TD>{o.recipientName}</TD>
                                                                            <TD>{o.recipientAddress}</TD>
                                                                            <TD>{o.deliveredAt ? new Date(o.deliveredAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'numeric', day: 'numeric' }) : '—'}</TD>
                                                                            <TD>{o.courierName ?? '—'}</TD>
                                                                            <TD align="right" bold>{gel(o.amount)}</TD>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: 'var(--color-bg-3)' }}>
                                    <TD colSpan={3} bold>{t.finPayHistTotal}</TD>
                                    <TD align="right" bold>{receipts.reduce((s, r) => s + r.orders.length, 0)}</TD>
                                    <TD align="right" bold color="#059669">{gel(totalCod)}</TD>
                                    <TD align="right" bold color="var(--color-accent)">{gel(totalService)}</TD>
                                    <TD> </TD>
                                </tr>
                            </tfoot>
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
    const [view, setView] = useState<'customers' | 'couriers' | 'payments' | 'courierPayments'>('customers');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="go-seg" style={{ display: 'inline-flex', alignSelf: 'flex-start' }}>
                <button className={`go-seg__btn ${view === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setView('customers')}>{t.finTabCustomers}</button>
                <button className={`go-seg__btn ${view === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setView('couriers')}>{t.finTabCouriers}</button>
                <button className={`go-seg__btn ${view === 'payments'  ? 'go-seg__btn--active' : ''}`} onClick={() => setView('payments')}>{t.finTabPaymentHistory}</button>
                <button className={`go-seg__btn ${view === 'courierPayments' ? 'go-seg__btn--active' : ''}`} onClick={() => setView('courierPayments')}>{t.finTabCourierPayments}</button>
            </div>

            {view === 'customers' && <CustomerLedger token={token} />}
            {view === 'couriers'  && <CourierLedger  token={token} />}
            {view === 'payments'  && <PaymentReceiptsSection token={token} />}
            {view === 'courierPayments' && <CourierPaymentReceiptsPanel token={token} admin />}
        </div>
    );
}
