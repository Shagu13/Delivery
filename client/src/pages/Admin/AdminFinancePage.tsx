import { useEffect, useState, useRef, useMemo, Fragment } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { useLanguage } from '../../contexts/useLanguage';
import { recipientDisplayName } from '../../utils/recipientName';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import { usePlaceLocalizer } from '../../utils/usePlaceLocalizer';
import { getStatusMeta } from '../../utils/statusMeta';
import { getCustomers, getCustomerById } from '../../api/customers';
import type { AdminCustomer, Customer } from '../../api/customers';
import { CustomerBankAccountsModal } from './CustomerBankAccountsModal';
import {
    fetchCustomerOrderFinance,
    fetchAllCustomersOrderFinance,
    fetchCustomerFinanceGrid,
    downloadCustomerOrderFinanceExcel,
    payCustomerOrders,
    OrderFinanceApiError,
} from '../../api/orderFinance';
import type { OrderFinanceLine, CustomerGridMode, CustomerGridContact } from '../../api/orderFinance';
import { setOrderPrices, fetchOrderLocations } from '../../api/orders';
import { fetchCompanyFinanceOverview, CompanyFinanceApiError } from '../../api/companyFinance';
import { CourierSettlementsSection } from './CourierSettlementsSection';
import { AllocCell, FlowBar, amountOf, buildFlow, toggle, setAmt, toggleAll } from './FinanceAllocation';
import type { FlowVM, Sel } from './FinanceAllocation';
import { AdminFinanceHistoryTab } from './AdminFinanceHistoryTab';
import { OutstandingBalancesModal } from './OutstandingBalancesModal';
import { CompanyFinanceOrdersModal } from './CompanyFinanceOrdersModal';
import { MultiCityDistrictFilter } from '../../components/ui/MultiCityDistrictFilter';
import type { CityDistrictOption } from '../../components/ui/MultiCityDistrictFilter';
import { round2, CANCELLED_STATUSES, isCancelledNonBillable, serviceOutstanding, codOutstanding, senderServiceShare, recipientFeePortion } from '../../utils/orderFinanceOutstanding';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// ── Customer search/select ──────────────────────────────────────────────────────

function CustomerPicker({ token, selected, onSelect, onClear }: {
    token: string;
    selected: Customer | null;
    onSelect: (c: Customer) => void;
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
    const { t, lang } = useLanguage();
    const now = new Date();
    const [from, setFrom] = useState(isoDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    const [to, setTo] = useState(isoDate(now));
    // Optional recipient-location narrowing of every figure on this card — any number of
    // cities and/or (once narrowed to a city) districts within them. Empty = all areas.
    const [filterCities, setFilterCities] = useState<string[]>([]);
    const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
    // Drill-down: the orders behind the figures above, for the same range and area filter.
    const [showOrders, setShowOrders] = useState(false);
    // Recipient locations actually used in [from, to] — drives the city/district picker
    // options (only offers areas that would return results).
    const locationsQuery = useQuery({
        queryKey: ['admin', 'finance', 'overviewLocations', from, to] as const,
        queryFn: () => fetchOrderLocations(token, from, to),
        enabled: !!token,
    });
    const locationOptions = locationsQuery.data ?? [];

    const locCity     = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);
    const locDistrict = (en: string, geo?: string | null) => (lang === 'ka' && geo ? geo : en);

    // Reload on date/location-filter change AND whenever a settlement action bumps
    // refreshSignal, so the cash position reflects a just-recorded payment without a
    // page refresh.
    const overviewQuery = useQuery({
        queryKey: ['admin', 'finance', 'overview', from, to, filterCities, filterDistricts, refreshSignal] as const,
        queryFn: () => fetchCompanyFinanceOverview(from, to, token, filterCities, filterDistricts),
        enabled: !!token,
        placeholderData: keepPreviousData,
    });
    const data    = overviewQuery.data ?? null;
    const loading = overviewQuery.isPending;
    const error   = overviewQuery.isError
        ? (overviewQuery.error instanceof CompanyFinanceApiError ? overviewQuery.error.message : t.finOvLoadFailed)
        : null;

    // Read-only customer breakdown grid for the same [from, to] window — expandable per
    // customer to see their orders, with a red X / green check for outstanding balances.
    const gridQuery = useQuery({
        queryKey: ['admin', 'finance', 'overviewGrid', from, to, refreshSignal] as const,
        queryFn: () => fetchAllCustomersOrderFinance(token, { from, to }),
        enabled: !!token,
        placeholderData: keepPreviousData,
    });
    const gridLines   = gridQuery.data ?? [];
    const gridLoading = gridQuery.isPending;

    // Same recipient-location narrowing as the rest of the card, applied client-side.
    const scopedGridLines = useMemo(() => gridLines.filter(l =>
        (filterCities.length === 0 || filterCities.includes(l.recipientCity))
        && (filterDistricts.length === 0 || filterDistricts.includes(l.recipientDistrict))
    ), [gridLines, filterCities, filterDistricts]);

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

            {/* Recipient-location filter — scopes every figure on this card to the selected
                cities/districts. No selection = all areas. */}
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border)' }}>
                <MultiCityDistrictFilter
                    options={locationOptions}
                    cities={filterCities} districts={filterDistricts}
                    onCitiesChange={setFilterCities} onDistrictsChange={setFilterDistricts}
                    locCity={locCity} locDistrict={locDistrict}
                />
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
                        <button
                            onClick={() => setShowOrders(true)}
                            style={{ marginLeft: 'auto', minHeight: 36, padding: '0 12px', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-accent)' }}
                        >
                            {t.finOvViewOrders}
                        </button>
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
                                <Row label={t.finCashCourierRemittance} value={gel(data.outstandingCourierRemittance)}  tone="paid" />
                            </div>
                        </div>
                    </div>

                    {/* ── Customer breakdown — read-only, expandable per customer ─────── */}
                    <div style={{ borderTop: '4px solid var(--color-border)', padding: '12px 14px' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 8 }}>
                            {t.finGridBreakdownTitle}
                        </div>
                        <CustomerFinanceGrid lines={scopedGridLines} mode="expand" loading={gridLoading} />
                    </div>
                </>
            )}
            {showOrders && (
                <CompanyFinanceOrdersModal
                    token={token} from={from} to={to}
                    cities={filterCities} districts={filterDistricts}
                    onClose={() => setShowOrders(false)}
                />
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

// round2 / CANCELLED_STATUSES / isCancelledNonBillable / serviceOutstanding / codOutstanding
// now live in utils/orderFinanceOutstanding.ts, shared with CustomerFinancePage.tsx.

// No COD is owed/collected unless the order was actually delivered (excludes cancelled,
// postponed and in-progress orders, plus failed deliveries) → those show "—".
const hasNoCod = (o: OrderFinanceLine) => o.isBillableFailedDelivery || o.deliveredAt == null;

// ── Payments status buckets ───────────────────────────────────────────────────────
type PayFilter = 'all' | 'pending' | 'paid';

// Pending = delivered but not yet fully settled on either flow (the customer still owes
// the service fee, or the company still owes the COD payout).
const isPendingLine = (o: OrderFinanceLine) =>
    o.deliveredAt != null && (serviceOutstanding(o) > 0.005 || codOutstanding(o) > 0.005);
// Paid = nothing outstanding on either flow AND at least one payment was actually recorded
// (so trivially-zero rows aren't mislabelled as "paid").
const isPaidLine = (o: OrderFinanceLine) =>
    serviceOutstanding(o) <= 0.005 && codOutstanding(o) <= 0.005
    && ((o.servicePaidByCustomerAmount ?? 0) > 0.005 || (o.codPaidToCustomerAmount ?? 0) > 0.005);

const filterLines = (lines: OrderFinanceLine[], f: PayFilter) =>
    f === 'pending' ? lines.filter(isPendingLine)
  : f === 'paid'    ? lines.filter(isPaidLine)
  : lines;

// ── Payments status filter — segmented switch with live per-bucket counts ──────────
function PaymentFilterSwitch({ value, counts, onChange }: {
    value: PayFilter; counts: Record<PayFilter, number>; onChange: (v: PayFilter) => void;
}) {
    const { t } = useLanguage();
    const items: { key: PayFilter; label: string; hint: string; color: string; tint: string }[] = [
        { key: 'all',     label: t.finPayFilterAll,     hint: t.finPayFilterAllHint,     color: 'var(--color-accent)', tint: 'var(--color-accent-dim)' },
        { key: 'pending', label: t.finPayFilterPending, hint: t.finPayFilterPendingHint, color: '#b45309',             tint: 'rgba(180,83,9,0.10)' },
        { key: 'paid',    label: t.finPayFilterPaid,    hint: t.finPayFilterPaidHint,    color: '#059669',             tint: 'rgba(5,150,105,0.10)' },
    ];
    return (
        <div role="tablist" aria-label={t.finViewPayments}
            style={{ display: 'inline-flex', maxWidth: '100%', overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-2)' }}>
            {items.map((it, i) => {
                const active = value === it.key;
                return (
                    <button key={it.key} role="tab" aria-selected={active} onClick={() => onChange(it.key)} title={it.hint}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 7,
                            padding: '8px 16px', border: 'none', cursor: 'pointer',
                            borderLeft: i ? '1px solid var(--color-border)' : 'none',
                            background: active ? it.tint : 'transparent',
                            color: active ? it.color : 'var(--color-text-muted)',
                            fontSize: '0.82rem', fontWeight: 700, whiteSpace: 'nowrap',
                            boxShadow: active ? `inset 0 -2px 0 ${it.color}` : 'none',
                            transition: 'background .15s, color .15s',
                        }}>
                        {it.label}
                        <span style={{
                            fontSize: '0.66rem', fontWeight: 800, minWidth: 18, textAlign: 'center',
                            padding: '1px 6px', borderRadius: 100, lineHeight: 1.5,
                            background: active ? it.color : 'var(--color-bg-3)',
                            color: active ? '#fff' : 'var(--color-text-subtle)',
                        }}>{counts[it.key]}</span>
                    </button>
                );
            })}
        </div>
    );
}

// ── Customer finance grid — date-first, all customers at once ─────────────────────
// One row per customer for the currently loaded (already date-filtered) `lines`. Two modes:
// 'picker' (Payments tab) — clicking a row hands the customerId to the caller, which opens
// the full per-order settle view below. 'expand' (Overview tab) — clicking a row toggles an
// inline, read-only order table for that customer, in place.

interface CustomerGroup {
    customerId: string;
    businessName: string;
    lines: OrderFinanceLine[];
    serviceOwed: number;
    codOwed: number;
    deliveredCount: number;
    codTotal: number;
    unpaid: boolean;
}

function groupLinesByCustomer(lines: OrderFinanceLine[], toSettle = false): CustomerGroup[] {
    const map = new Map<string, CustomerGroup>();
    for (const o of lines) {
        let g = map.get(o.customerId);
        if (!g) {
            g = { customerId: o.customerId, businessName: o.customerBusinessName, lines: [], serviceOwed: 0, codOwed: 0, deliveredCount: 0, codTotal: 0, unpaid: false };
            map.set(o.customerId, g);
        }
        g.lines.push(o);
    }
    for (const g of map.values()) {
        g.serviceOwed = round2(g.lines.reduce((s, o) => s + serviceOutstanding(o), 0));
        g.codOwed     = round2(g.lines.reduce((s, o) => s + codOutstanding(o), 0));
        // Either flow outstanding on any order that day → the customer still has something
        // unsettled. No obligations at all (nothing owed either way) counts as settled.
        g.deliveredCount = g.lines.filter(o => !!o.deliveredAt).length;
        g.codTotal = round2(g.lines
            .filter(o => !CANCELLED_STATUSES.has(o.status) && !o.isBillableFailedDelivery)
            .reduce((s, o) => s + (o.codAmount ?? 0), 0));
        // "To settle" lists customers by what is owed either way, so its badge follows the owed amounts.
        g.unpaid = toSettle
            ? g.serviceOwed > 0.005 || g.codOwed > 0.005
            : g.lines.some(isPendingLine);
    }
    return [...map.values()].sort((a, b) => a.businessName.localeCompare(b.businessName));
}

function PaidStatusBadge({ unpaid }: { unpaid: boolean }) {
    const { t } = useLanguage();
    return unpaid
        ? <span title={t.finGridUnpaid} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 800, fontSize: '0.8rem', lineHeight: 1 }}>✕</span>
        : <span title={t.finGridPaid}   style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', background: 'rgba(5,150,105,0.12)',  color: '#059669', fontWeight: 800, fontSize: '0.85rem', lineHeight: 1 }}>✓</span>;
}

function CustomerFinanceGrid({ lines, mode, onSelectCustomer, loading, contacts, toSettle }: {
    lines: OrderFinanceLine[];
    mode: 'picker' | 'expand';
    onSelectCustomer?: (customerId: string) => void;
    loading?: boolean;
    /** Picker mode only: contact + default-bank details per customer. */
    contacts?: CustomerGridContact[];
    /** Picker mode only: the "To settle" grid, whose badge follows the owed amounts. */
    toSettle?: boolean;
}) {
    const { t, lang } = useLanguage();
    const { locCity, locDistrict } = usePlaceLocalizer();
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [accountsFor, setAccountsFor] = useState<{ id: string; businessName: string } | null>(null);
    const groups = useMemo(() => groupLinesByCustomer(lines, toSettle), [lines, toSettle]);
    const contactById = useMemo(() => new Map((contacts ?? []).map(c => [c.customerId, c])), [contacts]);
    const picker = mode === 'picker';

    if (loading) {
        return <div className="content-card" style={{ padding: 40, textAlign: 'center' }}><div className="go-spinner" style={{ margin: '0 auto' }} /></div>;
    }
    if (groups.length === 0) {
        return <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t.finGridEmpty}</div>;
    }

    return (
        <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
            <style>{`.fin-grid-row:hover td { background: var(--color-bg-2); }`}</style>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: picker ? 1100 : 620 }}>
                    <thead>
                        <tr>
                            <th style={fhead}>{t.finGridColBusiness}</th>
                            {picker && <th style={fhead}>{t.finGridColContact}</th>}
                            {picker && <th style={fhead}>{t.finGridColPhone}</th>}
                            <th style={{ ...fhead, textAlign: 'center' }}>{t.finGridColOrders}</th>
                            {picker && <th style={{ ...fhead, textAlign: 'center' }}>{t.finGridColDelivered}</th>}
                            {picker && <th style={{ ...fhead, textAlign: 'right' }}>{t.finGridColCod}</th>}
                            <th style={{ ...fhead, textAlign: 'right' }}>{t.finGridColServiceOwed}</th>
                            <th style={{ ...fhead, textAlign: 'right' }}>{t.finGridColCodOwed}</th>
                            {picker && <th style={fhead}>{t.finGridColBank}</th>}
                            <th style={{ ...fhead, textAlign: 'center' }}>{t.finGridColStatus}</th>
                            <th style={{ ...fhead, width: 24 }} />
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map(g => {
                            const isExpanded = mode === 'expand' && expandedId === g.customerId;
                            const contact = contactById.get(g.customerId);
                            const toggle = () => mode === 'picker'
                                ? onSelectCustomer?.(g.customerId)
                                : setExpandedId(x => x === g.customerId ? null : g.customerId);
                            return (
                                <Fragment key={g.customerId}>
                                    <tr onClick={toggle} className="fin-grid-row" style={{ cursor: 'pointer' }}>
                                        <td style={{ ...fcell, fontWeight: 700 }}>{g.businessName}</td>
                                        {picker && <td style={fcell}>{contact ? `${contact.firstName} ${contact.lastName}`.trim() : '—'}</td>}
                                        {picker && <td style={{ ...fcell, whiteSpace: 'nowrap' }}>{contact?.phoneNumber || '—'}</td>}
                                        <td style={{ ...fcell, textAlign: 'center' }}>{g.lines.length}</td>
                                        {picker && <td style={{ ...fcell, textAlign: 'center' }}>{g.deliveredCount}</td>}
                                        {picker && <td style={{ ...fcell, textAlign: 'right' }}>{g.codTotal > 0.005 ? gel(g.codTotal) : '—'}</td>}
                                        <td style={{ ...fcell, textAlign: 'right', fontWeight: 600, color: g.serviceOwed > 0.005 ? '#ef4444' : 'var(--color-text-subtle)' }}>
                                            {g.serviceOwed > 0.005 ? gel(g.serviceOwed) : '—'}
                                        </td>
                                        <td style={{ ...fcell, textAlign: 'right', fontWeight: 600, color: g.codOwed > 0.005 ? '#b45309' : 'var(--color-text-subtle)' }}>
                                            {g.codOwed > 0.005 ? gel(g.codOwed) : '—'}
                                        </td>
                                        {picker && (
                                            <td style={{ ...fcell, fontSize: '0.78rem' }}>
                                                {contact?.defaultAccountNumber ? (
                                                    <>
                                                        <div style={{ fontWeight: 600 }}>{contact.defaultBankName}</div>
                                                        <div style={{ color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>{contact.defaultAccountNumber}</div>
                                                        {contact.bankAccountCount > 1 && (
                                                            <button type="button" className="btn-ghost btn-ghost--sm"
                                                                onClick={e => { e.stopPropagation(); setAccountsFor({ id: g.customerId, businessName: g.businessName }); }}>
                                                                +{contact.bankAccountCount - 1} {t.finGridMoreAccounts}
                                                            </button>
                                                        )}
                                                    </>
                                                ) : <span style={{ color: 'var(--color-text-subtle)' }}>{t.finGridNoBank}</span>}
                                            </td>
                                        )}
                                        <td style={{ ...fcell, textAlign: 'center' }}><PaidStatusBadge unpaid={g.unpaid} /></td>
                                        <td style={{ ...fcell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
                                            {mode === 'expand' ? (isExpanded ? '▾' : '▸') : '›'}
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr>
                                            <td colSpan={6} style={{ padding: 0, background: 'var(--color-bg)' }}>
                                                <div style={{ overflowX: 'auto' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                                                        <thead>
                                                            <tr>
                                                                <th style={fsubhead}>{t.ofinColTracking}</th>
                                                                <th style={fsubhead}>{t.ofinColRecipient}</th>
                                                                <th style={fsubhead}>{t.ofinColStatus}</th>
                                                                <th style={{ ...fsubhead, textAlign: 'right' }}>{t.ofinColService}</th>
                                                                <th style={{ ...fsubhead, textAlign: 'right' }}>{t.ofinColCod}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {g.lines.map(o => {
                                                                const cancelled = CANCELLED_STATUSES.has(o.status) || o.isBillableFailedDelivery;
                                                                const statusColor = cancelled ? '#dc2626' : o.status === 'DeliveryPostponed' ? '#f97316' : (o.deliveredAt ? '#059669' : 'var(--color-text-muted)');
                                                                const so = serviceOutstanding(o);
                                                                const co = codOutstanding(o);
                                                                return (
                                                                    <tr key={o.orderId}>
                                                                        <td style={fsubcell}>{o.trackingNumber}</td>
                                                                        <td style={fsubcell}>
                                                                            <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
                                                                            <div style={{ color: 'var(--color-text-subtle)', marginTop: 1 }}>
                                                                                {[locCity(o.recipientCity), locDistrict(o.recipientDistrict)].filter(Boolean).join(', ')}
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ ...fsubcell, color: statusColor, fontWeight: 700 }}>{getStatusMeta(o.status, lang).short}</td>
                                                                        <td style={{ ...fsubcell, textAlign: 'right', color: so > 0.005 ? '#ef4444' : 'var(--color-text-subtle)' }}>
                                                                            {(o.senderOwesService || o.customerSurcharge > 0) ? gel(senderServiceShare(o)) : '—'}
                                                                            {so > 0.005 && <div style={{ fontSize: '0.62rem', fontWeight: 700 }}>{t.finGridOwed}</div>}
                                                                        </td>
                                                                        <td style={{ ...fsubcell, textAlign: 'right', color: co > 0.005 ? '#b45309' : 'var(--color-text-subtle)' }}>
                                                                            {hasNoCod(o) ? '—' : gel(o.codAmount ?? 0)}
                                                                            {co > 0.005 && <div style={{ fontSize: '0.62rem', fontWeight: 700 }}>{t.finGridOwed}</div>}
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
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
                </table>
            </div>
            {accountsFor && (
                <CustomerBankAccountsModal customer={accountsFor} onClose={() => setAccountsFor(null)} />
            )}
        </div>
    );
}

function CustomerInvoicesSection({ token, onPaid }: { token: string; onPaid: () => void }) {
    const { t } = useLanguage();
    const [customer, setCustomer] = useState<Customer | null>(null);
    // Which customers the picker grid lists: all in the window, delivered in it, or anything to settle.
    const [gridMode, setGridMode] = useState<CustomerGridMode>('Effective');
    // Date filter modes: a single Day, a whole Month, or an inclusive custom Range.
    const [mode, setMode] = useState<'day' | 'month' | 'range'>('day');
    const [date, setDate] = useState(isoDate(new Date())); // day: a day; month: any day in the month; '' = all
    // Inclusive effective-date range (both blank = all dates). "23 to 26" includes the 26th.
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const pickCustomer = (customerId: string) => {
        // "To settle" ignores the date window; clear it so the detail view shows every outstanding order.
        if (gridMode === 'ToSettle') { setDate(''); setFrom(''); setTo(''); }
        getCustomerById(customerId, token).then(setCustomer).catch(() => {});
    };
    const showDateControls = !!customer || gridMode !== 'ToSettle';
    // Recipient-location narrowing, applied client-side over the loaded lines — any number
    // of cities and/or (once narrowed to a city) districts within them, plus a free-text
    // address contains-match.
    const [filterCities, setFilterCities] = useState<string[]>([]);
    const [filterDistricts, setFilterDistricts] = useState<string[]>([]);
    const [address, setAddress] = useState('');
    const [payFilter, setPayFilter] = useState<PayFilter>('all');
    const [toast, setToast] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);
    const [showBankAccounts, setShowBankAccounts] = useState(false);
    // Payment-action errors (e.g. a failed settlement save) reported by CustomerSettleCard —
    // distinct from (but displayed alongside) a failed lines fetch below.
    const [actionError, setActionError] = useState<string | null>(null);
    useEffect(() => { setActionError(null); }, [customer?.id]);
    const { locCity, locDistrict } = usePlaceLocalizer();

    const dateOpts = mode === 'range'
        ? { from: from || undefined, to: to || undefined }
        : mode === 'month'
            ? { date: date || undefined, monthly: true }
            : { date: date || undefined };

    const linesQuery = useQuery({
        queryKey: ['admin', 'finance', 'customerLines', customer?.id, mode, date, from, to] as const,
        queryFn: () => fetchCustomerOrderFinance(customer!.id, token, dateOpts),
        enabled: !!token && !!customer,
    });
    const lines   = customer ? (linesQuery.data ?? []) : [];
    const loading = customer ? linesQuery.isPending : false;
    const fetchError = customer && linesQuery.isError
        ? (linesQuery.error instanceof OrderFinanceApiError ? linesQuery.error.message : t.ofinErrLoad)
        : null;
    const error = actionError ?? fetchError;
    const load = () => { void linesQuery.refetch(); };

    // Exports the selected customer's currently-filtered rows — reuses the same `dateOpts`
    // the on-screen query is built from.
    const handleExport = async () => {
        if (!customer) return;
        setExporting(true);
        try {
            await downloadCustomerOrderFinanceExcel(customer.id, token, dateOpts);
        } catch {
            setActionError(t.ofinExportFail);
        } finally {
            setExporting(false);
        }
    };

    // Load the all-customers grid for the current date window whenever no customer is picked
    // yet — reuses the same day/month/range controls the per-customer view already exposes.
    const gridQuery = useQuery({
        queryKey: ['admin', 'finance', 'customerGrid', gridMode, mode, date, from, to] as const,
        queryFn: () => fetchCustomerFinanceGrid(token, gridMode, dateOpts),
        enabled: !!token && !customer,
        placeholderData: keepPreviousData,
    });
    const gridLines    = gridQuery.data?.lines ?? [];
    const gridContacts = gridQuery.data?.customers;
    const gridLoading = gridQuery.isPending;

    // City/district options offered by the picker — every distinct recipient location that
    // actually appears among this customer's loaded lines for the current date window.
    const locationOptions = useMemo<CityDistrictOption[]>(() => {
        const seen = new Set<string>();
        const opts: CityDistrictOption[] = [];
        for (const l of lines) {
            const key = `${l.recipientCity}|${l.recipientDistrict}`;
            if (seen.has(key)) continue;
            seen.add(key);
            opts.push({ city: l.recipientCity, district: l.recipientDistrict });
        }
        return opts;
    }, [lines]);

    // Narrow the loaded lines to the chosen recipient city/district/address before counting/showing.
    const scoped = lines.filter(l =>
        (filterCities.length === 0 || filterCities.includes(l.recipientCity))
        && (filterDistricts.length === 0 || filterDistricts.includes(l.recipientDistrict))
        && (!address || (l.recipientAddress ?? '').toLowerCase().includes(address.trim().toLowerCase())));

    // Per-bucket counts (over the scoped set) + the filtered subset shown.
    const counts: Record<PayFilter, number> = {
        all:     scoped.length,
        pending: scoped.filter(isPendingLine).length,
        paid:    scoped.filter(isPaidLine).length,
    };
    const visibleLines = filterLines(scoped, payFilter);

    const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

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
    const atToday = date !== '' && (mode === 'month' ? date.slice(0, 7) >= monthStr : date >= todayStr);
    const dateActive = mode === 'range' ? !!(from || to) : !!date;
    const hasFilter = dateActive || filterCities.length > 0 || filterDistricts.length > 0 || !!address.trim();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Toolbar: customer picker + inclusive from/to range + recipient city/district */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', position: 'relative', zIndex: 5, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <CustomerPicker
                        token={token}
                        selected={customer}
                        onSelect={setCustomer}
                        onClear={() => setCustomer(null)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
                        {/* Grid mode: only while no customer is picked */}
                        {!customer && (
                            <div className="go-seg" style={{ display: 'inline-flex' }}>
                                <button className={`go-seg__btn ${gridMode === 'Effective' ? 'go-seg__btn--active' : ''}`} onClick={() => setGridMode('Effective')}>{t.finGridModeAll}</button>
                                <button className={`go-seg__btn ${gridMode === 'Delivered' ? 'go-seg__btn--active' : ''}`} onClick={() => setGridMode('Delivered')}>{t.finGridModeDelivered}</button>
                                <button className={`go-seg__btn ${gridMode === 'ToSettle' ? 'go-seg__btn--active' : ''}`} onClick={() => setGridMode('ToSettle')}>{t.finGridModeToSettle}</button>
                            </div>
                        )}
                        {showDateControls && (<>
                        {/* Day / Month / Range toggle */}
                        <div className="go-seg" style={{ display: 'inline-flex' }}>
                            <button className={`go-seg__btn ${mode === 'day' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('day')}>{t.ofinViewDaily}</button>
                            <button className={`go-seg__btn ${mode === 'month' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('month')}>{t.ofinViewMonthly}</button>
                            <button className={`go-seg__btn ${mode === 'range' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('range')}>{t.ofinViewRange}</button>
                        </div>
                        {mode === 'day' && (
                            <>
                                <button onClick={() => shiftDay(-1)} title={t.statPrevDay} style={dateNavBtn}>‹</button>
                                <input type="date" value={date} max={todayStr} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
                                <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay}
                                    style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                            </>
                        )}
                        {mode === 'month' && (
                            <>
                                <button onClick={() => shiftMonth(-1)} title={t.ofinPrevMonth} style={dateNavBtn}>‹</button>
                                <input type="month" value={date ? date.slice(0, 7) : ''} max={monthStr}
                                    onChange={e => setDate(e.target.value ? e.target.value + '-01' : '')} style={dateInputStyle} />
                                <button onClick={() => !atToday && shiftMonth(1)} disabled={atToday} title={t.ofinNextMonth}
                                    style={{ ...dateNavBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                            </>
                        )}
                        {mode === 'range' && (
                            <>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvFrom}</span>
                                <input type="date" value={from} max={to || todayStr} onChange={e => setFrom(e.target.value)} style={dateInputStyle} />
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvTo}</span>
                                <input type="date" value={to} min={from || undefined} max={todayStr} onChange={e => setTo(e.target.value)} style={dateInputStyle} />
                            </>
                        )}
                        {dateActive && (
                            <button onClick={() => { setDate(''); setFrom(''); setTo(''); }} title={t.finAllDates}
                                style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                        )}
                        </>)}
                        {customer && (
                            <>
                                <button onClick={() => setShowBankAccounts(true)} className="btn-ghost btn-ghost--sm">
                                    {t.acupBankAccountsBtn}
                                </button>
                                <button onClick={handleExport} disabled={exporting} className="btn-ghost btn-ghost--sm">
                                    {exporting ? '…' : t.ofinExport}
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {/* Recipient-location filter (client-side over the loaded orders): multi city/district + address */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <MultiCityDistrictFilter
                        options={locationOptions}
                        cities={filterCities} districts={filterDistricts}
                        onCitiesChange={setFilterCities} onDistrictsChange={setFilterDistricts}
                        locCity={(en) => locCity(en)} locDistrict={(en) => locDistrict(en)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <input type="text" value={address} placeholder={t.ofinSearchAddress}
                            onChange={e => setAddress(e.target.value)}
                            style={{ ...dateInputStyle, flex: '1 1 200px', minWidth: 160, maxWidth: 320 }} />
                        {address && (
                            <button onClick={() => setAddress('')} title={t.finAllDates}
                                style={{ ...dateInputStyle, cursor: 'pointer', color: 'var(--color-text-muted)', lineHeight: 1, fontSize: '1rem' }}>×</button>
                        )}
                    </div>
                </div>
            </div>

            {/* Payment-status filter — only meaningful once a customer's orders are loaded */}
            {customer && !loading && lines.length > 0 && (
                <PaymentFilterSwitch value={payFilter} counts={counts} onChange={setPayFilter} />
            )}

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {!customer ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', padding: '0 2px' }}>{t.finGridPickHint}</div>
                    <CustomerFinanceGrid lines={gridLines} loading={gridLoading} mode="picker" onSelectCustomer={pickCustomer}
                        contacts={gridContacts} toSettle={gridMode === 'ToSettle'} />
                </div>
            ) : loading ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : scoped.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {!hasFilter ? t.ofinNoneAll : mode === 'month' ? t.ofinNoneMonth : t.ofinNoneDay}
                </div>
            ) : visibleLines.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {payFilter === 'pending' ? t.finPayNonePending : t.finPayNonePaid}
                </div>
            ) : (
                <CustomerSettleCard
                    key={customer.id + '|' + mode + '|' + date + '|' + from + '|' + to + '|' + filterCities.join(',') + '|' + filterDistricts.join(',') + '|' + address + '|' + payFilter}
                    customerId={customer.id}
                    lines={visibleLines}
                    token={token}
                    onError={setActionError}
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

            {showBankAccounts && (
                <CustomerBankAccountsModal
                    customer={customer}
                    onClose={() => setShowBankAccounts(false)}
                />
            )}
        </div>
    );
}

function Stat({ label, value, accent, color }: { label: string; value: string; accent?: boolean; color?: string }) {
    return (
        <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: color ?? (accent ? 'var(--color-accent)' : 'var(--color-text)') }}>{value}</div>
            <div style={{ fontSize: '0.62rem', color: 'var(--color-text-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        </div>
    );
}

// A single order's free-text notes for the finance grid: the package Description and/or the
// combined Comment (order note + postpone/cancellation). Each present one shows as the localized
// word ("Description" / "Comment") that reveals its full text as a hover/focus tooltip
// (read-only, not clickable) — Description on top, Comment below. Shows "—" when neither exists.
// Uses the native title tooltip so it can't be clipped by the table's scroll container.
function CommentCell({ description, comment }: { description: string | null; comment: string | null }) {
    const { t } = useLanguage();
    if (!description && !comment) return <span style={{ color: 'var(--color-text-subtle)' }}>—</span>;
    const trigger = (label: string, text: string) => (
        <span
            title={text}
            tabIndex={0}
            style={{ color: 'var(--color-accent)', fontWeight: 600, cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 2, whiteSpace: 'nowrap' }}
        >
            {label}
        </span>
    );
    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            {description && trigger(t.ofinColDescription, description)}
            {comment && trigger(t.ofinColComment, comment)}
        </div>
    );
}

// Inline editor for an order's company service fee AND its COD, side by side. The admin decides
// both values; nothing is re-split behind their back. Typing a new fee pre-fills the COD so a
// recipient-pays total (COD + fee) stays the same, but the COD stays editable. Saving propagates
// through the backend to the customer + courier settlements and the company overview, so an
// admin can correct a wrong price (e.g. city vs district rate) even after delivery.
function PricesEditor({ line, token, onError, onSaved }: {
    line: OrderFinanceLine; token: string; onError: (m: string) => void; onSaved: () => void;
}) {
    const { t } = useLanguage();
    const current = line.companyServicePrice;
    const currentCod = line.codAmount;
    const [editing, setEditing] = useState(false);
    const [fee, setFee] = useState(current.toFixed(2));
    const [cod, setCod] = useState(currentCod != null ? currentCod.toFixed(2) : '');
    const [codTouched, setCodTouched] = useState(false);
    // A surcharge (the part of the fee the customer owes on top of what the recipient pays) only
    // exists on recipient-pays orders.
    const isRecipientPays = line.whoPaysForCompanyService === 'Recipient';
    const currentSurcharge = line.customerSurcharge;
    const [surcharge, setSurcharge] = useState(currentSurcharge.toFixed(2));
    const [saving, setSaving] = useState(false);

    // Re-sync the display whenever the saved values change (after a reload).
    useEffect(() => {
        if (editing) return;
        setFee(current.toFixed(2));
        setCod(currentCod != null ? currentCod.toFixed(2) : '');
        setSurcharge(currentSurcharge.toFixed(2));
        setCodTouched(false);
    }, [current, currentCod, currentSurcharge, editing]);

    const cancel = () => { setEditing(false); };

    // Recipient-pays orders with a COD: keep the recipient's total (COD + fee − surcharge) constant
    // until the admin edits the COD by hand. Sender-pays fees aren't part of that total.
    const keepsTotal = isRecipientPays && currentCod != null;
    const suggestCod = (feeStr: string, surStr: string) => {
        const f = Number(feeStr);
        const s = surStr.trim() === '' ? 0 : Number(surStr);
        if (!keepsTotal || codTouched || feeStr.trim() === '' || isNaN(f) || f < 0 || isNaN(s) || s < 0) return;
        const recipientTotal = (currentCod ?? 0) + current - currentSurcharge;
        setCod(Math.max(0, round2(recipientTotal - (f - s))).toFixed(2));
    };
    const onFeeChange = (v: string) => { setFee(v); suggestCod(v, surcharge); };
    const onSurchargeChange = (v: string) => { setSurcharge(v); suggestCod(fee, v); };

    const feeN = Number(fee);
    const codN = cod.trim() === '' ? null : Number(cod);
    const surN = isRecipientPays ? (surcharge.trim() === '' ? 0 : Number(surcharge)) : 0;
    const surchargeTooBig = !isNaN(surN) && !isNaN(feeN) && surN > feeN + 0.0001;
    const valid = fee.trim() !== '' && !isNaN(feeN) && feeN >= 0
        && (codN === null || (!isNaN(codN) && codN >= 0))
        && !isNaN(surN) && surN >= 0 && !surchargeTooBig;
    // What the recipient hands the courier: COD plus their part of the fee (all of it unless a surcharge applies).
    const total = valid ? round2((codN ?? 0) + feeN - surN) : 0;
    const cash = line.amountOfCashCollected;
    const warnCash = valid && line.deliveredAt != null && !line.isBillableFailedDelivery
        && isRecipientPays && cash != null && Math.abs(total - cash) > 0.005;
    const warnPaid = valid && (line.codPaidToCustomerAmount ?? 0) > (codN ?? 0) + 0.005;
    const warnSurchargePaid = valid && isRecipientPays && (line.servicePaidByCustomerAmount ?? 0) > surN + 0.005;

    const save = async () => {
        if (!valid) { onError(surchargeTooBig ? t.ofinPriceSurchargeInvalid : t.ofinSvcInvalid); return; }
        const unchanged = round2(feeN) === round2(current)
            && (codN === null ? currentCod === null : currentCod !== null && round2(codN) === round2(currentCod))
            && round2(surN) === round2(currentSurcharge);
        if (unchanged) { setEditing(false); return; }
        setSaving(true);
        try {
            await setOrderPrices(token, line.orderId, round2(feeN), codN === null ? null : round2(codN), round2(surN));
            setEditing(false);
            onSaved();
        } catch (e) {
            onError(e instanceof Error ? e.message : t.ofinErrAction);
        } finally { setSaving(false); }
    };

    const btn: React.CSSProperties = { fontSize: '0.66rem', fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', border: '1px solid var(--color-border)' };
    const input: React.CSSProperties = { width: 72, textAlign: 'right', background: 'var(--color-bg-3)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.74rem', padding: '2px 5px', outline: 'none' };
    const lbl: React.CSSProperties = { color: 'var(--color-text-subtle)', minWidth: 56, textAlign: 'right' };
    const warn: React.CSSProperties = { maxWidth: 220, whiteSpace: 'normal', textAlign: 'right', color: '#d97706', fontWeight: 600, lineHeight: 1.3 };
    const keys = (e: React.KeyboardEvent) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') cancel(); };

    if (!editing) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, fontSize: '0.7rem', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--color-text-subtle)' }}>{t.ofinColService}:</span>
                <strong style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{gel(current)}</strong>
                <button onClick={() => setEditing(true)} style={{ ...btn, background: 'var(--color-bg-3)', color: 'var(--color-accent)' }}>{t.edit}</button>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginTop: 3, fontSize: '0.7rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={lbl}>{t.ofinColService}:</span>
                <span style={{ color: 'var(--color-text-subtle)' }}>₾</span>
                <input type="number" min="0" step="0.01" value={fee} autoFocus disabled={saving}
                    onChange={e => onFeeChange(e.target.value)} onKeyDown={keys} style={input} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={lbl}>{t.ofinPriceCod}:</span>
                <span style={{ color: 'var(--color-text-subtle)' }}>₾</span>
                <input type="number" min="0" step="0.01" value={cod} disabled={saving}
                    onChange={e => { setCod(e.target.value); setCodTouched(true); }} onKeyDown={keys} style={input} />
            </label>
            {isRecipientPays && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={t.ofinPriceSurchargeTitle}>
                    <span style={lbl}>{t.ofinPriceSurcharge}:</span>
                    <span style={{ color: 'var(--color-text-subtle)' }}>₾</span>
                    <input type="number" min="0" step="0.01" value={surcharge} disabled={saving}
                        onChange={e => onSurchargeChange(e.target.value)} onKeyDown={keys} style={input} />
                </label>
            )}
            {valid && <span style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>{t.ofinPriceTotal(gel(total))}</span>}
            {surchargeTooBig && <span style={warn}>{t.ofinPriceSurchargeInvalid}</span>}
            {warnCash && cash != null && <span style={warn}>{t.ofinPriceWarnCash(gel(cash), gel(total))}</span>}
            {warnPaid && <span style={warn}>{t.ofinPriceWarnPaid(gel(line.codPaidToCustomerAmount ?? 0))}</span>}
            {warnSurchargePaid && <span style={warn}>{t.ofinPriceWarnSurchargePaid(gel(line.servicePaidByCustomerAmount ?? 0))}</span>}
            <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => void save()} disabled={saving} style={{ ...btn, background: 'var(--color-accent)', color: '#fff', borderColor: 'var(--color-accent)' }}>{saving ? '…' : t.save}</button>
                <button onClick={cancel} disabled={saving} style={{ ...btn, background: 'var(--color-bg-3)', color: 'var(--color-text-muted)' }}>✕</button>
            </div>
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
    const { t, lang } = useLanguage();
    const { locCity, locDistrict } = usePlaceLocalizer();
    const [expanded, setExpanded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [selCod, setSelCod] = useState<Sel>({});
    const [selSvc, setSelSvc] = useState<Sel>({});

    // A checked row freezes its outstanding amount into `sel` (so the admin can hand-edit
    // it) — but that freeze goes stale the moment the underlying figures change, e.g. an
    // admin corrects CompanyServicePrice from the fee editor further down this same card.
    // Without this, the Net settlement bar and a Settle submission would silently keep
    // using the pre-edit amount. Drop the selection whenever fresh lines come in so the
    // admin re-ticks against the current outstanding.
    useEffect(() => { setSelCod({}); setSelSvc({}); }, [lines]);

    // Outstanding per order for each flow (shared module helpers — see their definitions).
    const codOut = codOutstanding;
    const svcOut = serviceOutstanding;

    const cod = buildFlow(lines, selCod, codOut, o => o.codPaidToCustomerAmount ?? 0);
    const svc = buildFlow(lines, selSvc, svcOut, o => o.servicePaidByCustomerAmount ?? 0);

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

    // Net settlement: the cash that physically changes hands is the COD the company owes
    // the customer minus the sender-paid service the customer owes the company. One click
    // settles BOTH flows in full per order (the books still record each flow separately).
    const bothSettled = cod.owed <= 0.005 && svc.owed <= 0.005;

    // The net bar reflects only the currently-ticked orders — Settle net settles exactly
    // what's selected, so the headline figure = selected COD to pay out − selected service
    // to receive (not the grand total across every order).
    const selNet = round2(cod.selTotal - svc.selTotal);
    const hasSelection = cod.selCount > 0 || svc.selCount > 0;

    // Settle net only touches what's ticked: COD ticks settle COD, service ticks settle
    // service, both settle both. Amounts honour any inline edits, capped at what's owed.
    const settleNet = async () => {
        const codChosen = cod.payable.filter(o => selCod[o.orderId]?.checked);
        const svcChosen = svc.payable.filter(o => selSvc[o.orderId]?.checked);
        if (codChosen.length === 0 && svcChosen.length === 0) { onError(t.ofinErrSelectOrders); return; }
        for (const o of codChosen) {
            const a = Number(amountOf(selCod, o, codOut));
            if (isNaN(a) || a <= 0 || a > codOut(o) + 0.005) { onError(t.ofinErrAllocInvalid); return; }
        }
        for (const o of svcChosen) {
            const a = Number(amountOf(selSvc, o, svcOut));
            if (isNaN(a) || a <= 0 || a > svcOut(o) + 0.005) { onError(t.ofinErrAllocInvalid); return; }
        }
        const codAllocs = codChosen.map(o => ({ orderId: o.orderId, amount: round2(Number(amountOf(selCod, o, codOut))) }));
        const svcAllocs = svcChosen.map(o => ({ orderId: o.orderId, amount: round2(Number(amountOf(selSvc, o, svcOut))) }));
        setBusy(true);
        try {
            if (codAllocs.length > 0) await payCustomerOrders(customerId, false, codAllocs, token);
            if (svcAllocs.length > 0) await payCustomerOrders(customerId, true,  svcAllocs, token);
            setSelCod({}); setSelSvc({});
            onChanged();
        } catch (e) {
            onError(e instanceof OrderFinanceApiError ? e.message : t.ofinErrAction);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="content-card" style={{ padding: 0, overflow: 'visible' }}>
          {/* Sticky control header — the summary, net bar and pay bars follow the admin
              down the (potentially long) per-order list; only the table below scrolls. */}
          <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--color-bg-2)', borderTopLeftRadius: 'var(--radius-lg)', borderTopRightRadius: 'var(--radius-lg)' }}>
            {/* Summary header (click to expand). Left = service (customer → company); right = COD (company → customer). */}
            <button onClick={() => setExpanded(x => !x)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 18 }}>
                        <Stat label={t.ofinServiceToCollect} value={gel(svc.owed)} color={svc.owed > 0.005 ? '#ef4444' : undefined} />
                        <Stat label={t.ofinServicePaidLbl} value={gel(svc.paid)} color={svc.paid > 0.005 ? '#059669' : undefined} />
                    </div>
                    <div style={{ display: 'flex', gap: 18 }}>
                        <Stat label={t.ofinCodToPay} value={gel(cod.owed)} color={cod.owed > 0.005 ? '#ef4444' : undefined} />
                        <Stat label={t.ofinCodPaidLbl} value={gel(cod.paid)} color={cod.paid > 0.005 ? '#059669' : undefined} />
                    </div>
                </div>
                <span style={{ fontSize: '1.2rem', color: 'var(--color-text-subtle)', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
            </button>

            {/* Net settlement bar — the cash physically handed over = COD owed − service owed.
                One click settles both flows in full per order. */}
            <div style={{ borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--color-bg-2)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>
                            {selNet >= 0 ? t.ofinNetToHandOver : t.ofinNetCustomerOwes}
                        </span>
                        <span style={{ fontSize: '1.15rem', fontWeight: 800, color: selNet >= 0 ? 'var(--color-accent)' : '#b45309' }}>{gel(Math.abs(selNet))}</span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-subtle)' }}>{t.ofinNetFormula(gel(cod.selTotal), gel(svc.selTotal))}</span>
                    </div>
                </div>
                {bothSettled
                    ? <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#059669' }}>{t.ofinAllSettled}</span>
                    : <button className="btn-primary" disabled={busy || !hasSelection} onClick={settleNet}>{t.ofinSettleNet}</button>}
            </div>

            {/* Pay bars: service (left), COD (right) */}
            <div style={{ borderTop: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <FlowBar f={svc} payLabel={t.ofinPayService} busy={busy} borderRight
                    onToggleAll={check => toggleAll(setSelSvc, svc.payable, svcOut, check)}
                    onPay={() => doPay(true, svc, selSvc, svcOut, setSelSvc)} />
                <FlowBar f={cod} payLabel={t.ofinPayCod} busy={busy}
                    netTotal={selNet}
                    netFormula={svc.selCount > 0 ? t.ofinNetFormula(gel(cod.selTotal), gel(svc.selTotal)) : undefined}
                    onToggleAll={check => toggleAll(setSelCod, cod.payable, codOut, check)}
                    onPay={() => doPay(false, cod, selCod, codOut, setSelCod)} />
            </div>
          </div>{/* end sticky control header */}

            {/* Expanded per-order list — Excel-style grid. Fee (+edit) sits on the right next to
                the COD breakdown; the Settle column carries the per-order pay controls. */}
            {expanded && (
                <div style={{ overflowX: 'auto', borderTop: '1px solid var(--color-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1040 }}>
                        <thead>
                            <tr>
                                <th style={{ ...fhead, textAlign: 'center' }}>#</th>
                                <th style={fhead}>{t.ofinColTracking}</th>
                                <th style={fhead}>{t.ofinColRecipient}</th>
                                <th style={fhead}>{t.ofinColStatus}</th>
                                <th style={{ ...fhead, textAlign: 'center' }}>{t.ofinColComment}</th>
                                <th style={{ ...fhead, textAlign: 'right' }}>{t.ofinColService}</th>
                                <th style={{ ...fhead, textAlign: 'right' }}>{t.ofinColCod}</th>
                                <th style={{ ...fhead, textAlign: 'right' }}>{t.ofinColSettle}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((o, idx) => {
                                const so = svcOut(o);
                                const co = codOut(o);
                                const isSenderPays = o.senderOwesService;
                                const cancelled = CANCELLED_STATUSES.has(o.status) || o.isBillableFailedDelivery;
                                const postponed = o.status === 'DeliveryPostponed';
                                const statusColor = cancelled ? '#dc2626' : postponed ? '#f97316' : (o.deliveredAt ? '#059669' : 'var(--color-text-muted)');

                                // COD-collected breakdown (compact one-liner). Recipient-pays: COD + Fee = total
                                // (cash the courier collected). Sender-pays: COD only, fee invoiced to the sender.
                                const codVal = hasNoCod(o) ? 0 : (o.codAmount ?? 0);
                                // Recipient-pays: only the recipient's portion of the fee is part of the cash collected;
                                // a customer surcharge is appended below as a sender receivable.
                                const fee = isSenderPays ? o.companyServicePrice : recipientFeePortion(o);
                                let breakdown = '—';
                                // Only delivered orders (or billable failed deliveries, which still owe the fee)
                                // have a "collected" breakdown; postponed / in-progress / cancelled show "—".
                                if ((o.deliveredAt != null || o.isBillableFailedDelivery) && !isCancelledNonBillable(o)) {
                                    if (codVal > 0 && !isSenderPays)      breakdown = `COD ${gel(codVal)} + ${t.ofinFeeShort} ${gel(fee)} = ${gel(round2(codVal + fee))}`;
                                    else if (codVal > 0 && isSenderPays)  breakdown = `COD ${gel(codVal)} · ${t.ofinFeeShort} ${gel(fee)} (${t.ofinSenderShort})`;
                                    else if (fee > 0 && isSenderPays)     breakdown = `${t.ofinFeeShort} ${gel(fee)} (${t.ofinSenderShort})`;
                                    else if (fee > 0)                     breakdown = `${t.ofinFeeShort} ${gel(fee)}`;
                                    else if (codVal > 0)                  breakdown = `COD ${gel(codVal)}`;
                                    if (!isSenderPays && o.customerSurcharge > 0)
                                        breakdown += ` · ${t.ofinFeeShort} +${gel(o.customerSurcharge)} (${t.ofinSenderShort})`;
                                }

                                return (
                                    <tr key={o.orderId}>
                                        <td style={{ ...fcell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{idx + 1}</td>
                                        <td style={{ ...fcell, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            <div>{o.trackingNumber}</div>
                                            {/* Order type shown beneath the tracking number (its own column was removed). */}
                                            <div style={{ marginTop: 3 }}>
                                                <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 100, background: o.isReturn ? 'rgba(139,92,246,0.12)' : 'var(--color-accent-dim)', color: o.isReturn ? '#8b5cf6' : 'var(--color-accent)', whiteSpace: 'nowrap' }}>
                                                    {o.orderType === 'Return' ? t.aopOrderTypeReturn : o.orderType === 'Exchange' ? t.aopOrderTypeExchange : t.aopOrderTypeSend}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={fcell}>
                                            <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
                                            <div style={{ color: 'var(--color-text-subtle)', marginTop: 1 }}>
                                                {[locCity(o.recipientCity), locDistrict(o.recipientDistrict), o.recipientAddress].filter(Boolean).join(', ')}
                                            </div>
                                        </td>
                                        <td style={fcell}>
                                            <div style={{ fontWeight: 700, color: statusColor }}>{getStatusMeta(o.status, lang).short}</div>
                                            {/* All cancelled/failed orders flagged in red so they catch the admin's eye. */}
                                            {cancelled && o.cancellationReason && (
                                                <div style={{ color: '#dc2626', fontSize: '0.66rem', fontWeight: 600 }}>
                                                    {t.cdCancelReasons[o.cancellationReason]}{o.cancellationReason === 'Other' && o.cancellationComment ? `: ${o.cancellationComment}` : ''}
                                                </div>
                                            )}
                                            <div style={{ color: 'var(--color-text-subtle)', fontSize: '0.64rem', marginTop: 2, whiteSpace: 'nowrap' }}>
                                                <div>{t.ofinColPlaced}: {formatGeorgianDateTime(o.createdAt)}</div>
                                                <div>{t.ofinColDelivered}: {o.deliveredAt ? formatGeorgianDateTime(o.deliveredAt) : t.ofinNotDelivered}</div>
                                            </div>
                                        </td>
                                        {/* Comment — the package description and/or the customer's order note
                                            plus any postpone / cancellation note; hover each to read the text. */}
                                        <td style={{ ...fcell, textAlign: 'center' }}>
                                            <CommentCell
                                                description={o.description || null}
                                                comment={[o.orderNote, o.postponeComment, o.cancellationComment].filter(Boolean).join(' · ') || null}
                                            />
                                        </td>
                                        {/* Company fee + inline edit, with who pays it. */}
                                        <td style={{ ...fcell, textAlign: 'right', whiteSpace: 'nowrap' }}>
                                            <PricesEditor line={o} token={token} onError={onError} onSaved={onChanged} />
                                            <div style={{ fontSize: '0.64rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                                                {isSenderPays ? t.ofinSenderPays : t.ofinRecipientPays}
                                            </div>
                                            {!isSenderPays && o.customerSurcharge > 0 && (
                                                <div style={{ fontSize: '0.64rem', fontWeight: 700, color: '#b45309', marginTop: 1 }}>
                                                    {t.ofinSurchargeAdmin(gel(o.customerSurcharge))}
                                                </div>
                                            )}
                                        </td>
                                        {/* COD collected breakdown. */}
                                        <td style={{ ...fcell, textAlign: 'right', whiteSpace: 'nowrap', color: breakdown === '—' ? 'var(--color-text-subtle)' : 'var(--color-text)', fontWeight: 600 }}>
                                            {breakdown}
                                        </td>
                                        {/* Settle: per-order pay controls for service + COD. */}
                                        <td style={{ ...fcell, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                                                    <span style={settleLbl}>{t.ofinFeeShort}</span>
                                                    {isCancelledNonBillable(o)
                                                        ? <span style={{ minWidth: 160, textAlign: 'right', color: 'var(--color-text-subtle)' }}>—</span>
                                                        : <AllocCell applicable={isSenderPays || o.customerSurcharge > 0} outstanding={so} paidAt={o.servicePaidByCustomerAt}
                                                            total={senderServiceShare(o)} paid={o.servicePaidByCustomerAmount ?? 0}
                                                            checked={selSvc[o.orderId]?.checked ?? false} amount={amountOf(selSvc, o, svcOut)}
                                                            onToggle={() => toggle(setSelSvc, o.orderId, so)}
                                                            onAmount={v => setAmt(setSelSvc, o.orderId, v)} />}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                                                    <span style={settleLbl}>COD</span>
                                                    {hasNoCod(o)
                                                        ? <span style={{ minWidth: 160, textAlign: 'right', color: 'var(--color-text-subtle)' }}>—</span>
                                                        : <AllocCell applicable={true} outstanding={co} paidAt={o.codPaidToCustomerAt}
                                                            total={o.codAmount ?? 0} paid={o.codPaidToCustomerAmount ?? 0}
                                                            checked={selCod[o.orderId]?.checked ?? false} amount={amountOf(selCod, o, codOut)}
                                                            onToggle={() => toggle(setSelCod, o.orderId, co)}
                                                            onAmount={v => setAmt(setSelCod, o.orderId, v)}
                                                            warning={!o.hasCourierTransferedAmount ? t.ofinCourierNotRemittedWarning : undefined} />}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────────

export default function AdminFinancePage({ token }: { token: string }) {
    const { t } = useLanguage();
    // Primary toggle: Overview (company reports) ↔ Payments (settle a customer / courier).
    const [view, setView] = useState<'overview' | 'payments'>('overview');
    const [payTab, setPayTab] = useState<'customers' | 'couriers'>('customers');
    // Bumped after a payment so the company cash-position card reloads without a refresh.
    const [overviewRefresh, setOverviewRefresh] = useState(0);
    const [showOutstanding, setShowOutstanding] = useState(false);

    // A delivery/payment made elsewhere (e.g. the Packages/Delivery page marking an order
    // delivered) never touches this page's own `overviewRefresh` nonce, so without this the
    // Overview and Payments queries just sit on whatever they last fetched. Mirror the
    // adminOrdersChanged subscription every other admin page already uses: invalidate every
    // Finance query so the currently-visible tab's data quietly refetches in the background
    // (they all use `placeholderData`/cached data, so this never flashes a spinner) while
    // inactive tabs simply refetch next time they're opened.
    const queryClient = useQueryClient();
    useOrdersChangedSignal(token, 'adminOrdersChanged', () => {
        void queryClient.invalidateQueries({ queryKey: ['admin', 'finance'] });
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Primary toggle + contextual controls (outstanding launcher / payments sub-tabs) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div className="go-seg" style={{ display: 'inline-flex' }}>
                    <button className={`go-seg__btn ${view === 'overview' ? 'go-seg__btn--active' : ''}`} onClick={() => setView('overview')}>{t.finViewOverview}</button>
                    <button className={`go-seg__btn ${view === 'payments' ? 'go-seg__btn--active' : ''}`} onClick={() => setView('payments')}>{t.finViewPayments}</button>
                </div>

                {view === 'overview' ? (
                    <button className="btn-primary" onClick={() => setShowOutstanding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t.finOutBtn}
                    </button>
                ) : (
                    <div className="go-seg" style={{ display: 'inline-flex' }}>
                        <button className={`go-seg__btn ${payTab === 'customers' ? 'go-seg__btn--active' : ''}`} onClick={() => setPayTab('customers')}>{t.finTabCustomers}</button>
                        <button className={`go-seg__btn ${payTab === 'couriers'  ? 'go-seg__btn--active' : ''}`} onClick={() => setPayTab('couriers')}>{t.finTabCouriers}</button>
                    </div>
                )}
            </div>

            {/* ── Overview: company reports (cash position + outstanding + history) ── */}
            {view === 'overview' && (
                <>
                    <CompanyOverviewCard token={token} refreshSignal={overviewRefresh} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)' }}>{t.finOverviewHistory}</span>
                        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                    </div>
                    <AdminFinanceHistoryTab token={token} />
                </>
            )}

            {/* ── Payments: settle a chosen customer (All/Pending/Paid) or courier ── */}
            {view === 'payments' && payTab === 'customers' && (
                <CustomerInvoicesSection token={token} onPaid={() => setOverviewRefresh(k => k + 1)} />
            )}
            {view === 'payments' && payTab === 'couriers' && (
                <CourierSettlementsSection token={token} onSettled={() => setOverviewRefresh(k => k + 1)} />
            )}

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
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.95rem',
    width: 28, height: 28, cursor: 'pointer', lineHeight: 1,
};

// Excel-style grid cells for the per-order settlement table.
const fcell: React.CSSProperties = {
    border: '1px solid var(--color-border)', padding: '6px 8px',
    fontSize: '0.74rem', color: 'var(--color-text)', verticalAlign: 'top',
};
const fhead: React.CSSProperties = {
    ...fcell, background: 'var(--color-bg-2)', fontWeight: 700, fontSize: '0.62rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-subtle)',
    whiteSpace: 'nowrap', textAlign: 'left',
};
const settleLbl: React.CSSProperties = {
    fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-text-subtle)',
    textTransform: 'uppercase', minWidth: 26, textAlign: 'right',
};

// Nested (expanded-row) grid cells — same Excel-style convention, slightly more compact.
const fsubcell: React.CSSProperties = {
    border: '1px solid var(--color-border)', padding: '5px 8px',
    fontSize: '0.7rem', color: 'var(--color-text)', verticalAlign: 'top',
};
const fsubhead: React.CSSProperties = {
    ...fsubcell, background: 'var(--color-bg-3)', fontWeight: 700, fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-subtle)',
    whiteSpace: 'nowrap', textAlign: 'left',
};
