import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { usePlaceLocalizer } from '../../utils/usePlaceLocalizer';
import { getStatusMeta } from '../../utils/statusMeta';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import { fetchCompanyFinanceOrders, CompanyFinanceApiError } from '../../api/companyFinance';
import type { CompanyFinanceOrder, CompanyFinanceOrderGroup } from '../../api/companyFinance';

const gel = (n: number) => `₾${n.toFixed(2)}`;
const RED = '#ef4444';
const AMBER = '#b45309';

interface Props {
    token: string;
    from: string;
    to: string;
    cities: string[];
    districts: string[];
    onClose: () => void;
}

type GroupFilter = 'all' | CompanyFinanceOrderGroup;

// "OrderNotAccepted" → "Order Not Accepted" (same fallback getStatusMeta uses for unknown keys).
const humanize = (key: string) => key.replace(/([A-Z])/g, ' $1').trim();

/** The orders behind the company overview's profit figures, for the same range and area filter. */
export function CompanyFinanceOrdersModal({ token, from, to, cities, districts, onClose }: Props) {
    const { t, lang } = useLanguage();
    const { locCity, locDistrict } = usePlaceLocalizer();
    const [group, setGroup] = useState<GroupFilter>('all');

    const query = useQuery({
        queryKey: ['admin', 'finance', 'overviewOrders', from, to, cities, districts] as const,
        queryFn: () => fetchCompanyFinanceOrders(from, to, token, cities, districts),
        enabled: !!token,
    });
    const error = query.isError
        ? (query.error instanceof CompanyFinanceApiError ? query.error.message : t.finOrdLoadFailed)
        : null;

    const all = useMemo(() => query.data?.orders ?? [], [query.data]);
    const rows = useMemo(() => group === 'all' ? all : all.filter(o => o.group === group), [all, group]);
    const counts = useMemo(() => ({
        Delivered:      all.filter(o => o.group === 'Delivered').length,
        BillableFailed: all.filter(o => o.group === 'BillableFailed').length,
    }), [all]);
    // Totals of what is on screen — for "All" they equal the overview's revenue / salary / margin / COD.
    const totals = useMemo(() => rows.reduce((a, o) => ({
        fee:    a.fee + o.serviceFee,
        salary: a.salary + (o.courierSalary ?? 0),
        margin: a.margin + o.margin,
        cod:    a.cod + (o.cod ?? 0),
    }), { fee: 0, salary: 0, margin: 0, cod: 0 }), [rows]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const tabs: { key: GroupFilter; label: string; count: number }[] = [
        { key: 'all',            label: t.finOrdAll,             count: all.length },
        { key: 'Delivered',      label: t.finOrdGroupDelivered,  count: counts.Delivered },
        { key: 'BillableFailed', label: t.finOrdGroupBillable,   count: counts.BillableFailed },
    ];

    return createPortal(
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div role="dialog" aria-modal="true" style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201,
                width: 'min(1040px, calc(100vw - 16px))', maxHeight: 'calc(100dvh - 24px)', display: 'flex', flexDirection: 'column',
                background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '16px 16px 12px', borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{t.finOrdTitle}</h2>
                        <p style={{ fontSize: '0.76rem', color: 'var(--color-text-subtle)', margin: '4px 0 0' }}>
                            {from} → {to}{(cities.length > 0 || districts.length > 0) ? ` · ${[...cities, ...districts].join(', ')}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Group tabs */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px', borderBottom: '1px solid var(--color-border)' }}>
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => setGroup(tab.key)} style={{
                            minHeight: 36, padding: '0 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                            border: '1px solid var(--color-border)',
                            background: group === tab.key ? 'var(--color-accent-dim)' : 'var(--color-bg-3)',
                            color: group === tab.key ? 'var(--color-accent)' : 'var(--color-text-muted)',
                        }}>
                            {tab.label} ({tab.count})
                        </button>
                    ))}
                </div>
                <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: 'var(--color-text-subtle)', borderBottom: '1px solid var(--color-border)' }}>
                    {t.finOrdBillableHint}
                </div>

                {/* Body */}
                <div style={{ overflow: 'auto' }}>
                    {query.isPending ? (
                        <div style={{ padding: 40, textAlign: 'center' }}><div className="go-spinner" style={{ margin: '0 auto' }} /></div>
                    ) : error ? (
                        <div style={{ padding: '16px', color: RED, fontSize: '0.85rem' }}>{error}</div>
                    ) : rows.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t.finOrdNone}</div>
                    ) : (
                        <table style={{ width: '100%', minWidth: 860, borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0, background: 'var(--color-bg-2)' }}>
                                    <th style={thLeft}>{t.finOrdColOrder}</th>
                                    <th style={thLeft}>{t.finOrdColDate}</th>
                                    <th style={thLeft}>{t.finOrdColCustomer}</th>
                                    <th style={thLeft}>{t.finOrdColArea}</th>
                                    <th style={thLeft}>{t.finOrdColCourier}</th>
                                    <th style={thRight}>{t.finOrdColFee}</th>
                                    <th style={thRight}>{t.finOrdColSalary}</th>
                                    <th style={thRight}>{t.finOrdColMargin}</th>
                                    <th style={thRight}>{t.finOrdColCod}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(o => <OrderRow key={o.orderId} o={o} lang={lang} locCity={locCity} locDistrict={locDistrict} />)}
                            </tbody>
                            <tfoot>
                                <tr style={{ borderTop: '2px solid var(--color-border)', fontWeight: 800 }}>
                                    <td style={{ ...tdLeft, color: 'var(--color-text)' }} colSpan={5}>{t.finOrdTotal} ({rows.length})</td>
                                    <td style={tdRight}>{gel(totals.fee)}</td>
                                    <td style={tdRight}>{gel(totals.salary)}</td>
                                    <td style={{ ...tdRight, color: 'var(--color-accent)' }}>{gel(totals.margin)}</td>
                                    <td style={tdRight}>{gel(totals.cod)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>
        </>,
        document.body
    );
}

function OrderRow({ o, lang, locCity, locDistrict }: {
    o: CompanyFinanceOrder;
    lang: Parameters<typeof getStatusMeta>[1];
    locCity: (n: string | null | undefined) => string;
    locDistrict: (n: string | null | undefined) => string;
}) {
    const failed = o.group === 'BillableFailed';
    return (
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={tdLeft}>
                <div style={{ fontWeight: 700, color: 'var(--color-text)', fontFamily: "'Courier New', monospace" }}>{o.trackingNumber}</div>
                <div style={{ fontSize: '0.72rem', color: failed ? RED : 'var(--color-text-subtle)' }}>
                    {getStatusMeta(o.status, lang).short}{failed && o.cancellationReason ? ` · ${humanize(o.cancellationReason)}` : ''}
                </div>
            </td>
            <td style={{ ...tdLeft, whiteSpace: 'nowrap' }}>{formatGeorgianDateTime(o.eventAt)}</td>
            <td style={tdLeft}>{o.customerName ?? '—'}</td>
            <td style={tdLeft}>{locCity(o.recipientCity)}, {locDistrict(o.recipientDistrict)}</td>
            <td style={tdLeft}>{o.courierName ?? '—'}</td>
            <td style={tdRight}>{gel(o.serviceFee)}</td>
            <td style={{ ...tdRight, color: AMBER }}>{o.courierSalary != null ? gel(o.courierSalary) : '—'}</td>
            <td style={{ ...tdRight, fontWeight: 700 }}>{gel(o.margin)}</td>
            <td style={tdRight}>{o.cod != null ? gel(o.cod) : '—'}</td>
        </tr>
    );
}

const thLeft: React.CSSProperties = { textAlign: 'left', padding: '8px 12px', fontSize: '0.64rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' };
const thRight: React.CSSProperties = { ...thLeft, textAlign: 'right' };
const tdLeft: React.CSSProperties = { padding: '8px 12px', color: 'var(--color-text-muted)', verticalAlign: 'top' };
const tdRight: React.CSSProperties = { padding: '8px 12px', textAlign: 'right', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap', color: 'var(--color-text)', verticalAlign: 'top' };
