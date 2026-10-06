import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchCouriers } from '../../api/couriers';
import {
    fetchCourierPaymentReceiptsAdmin,
    fetchMyCourierPaymentReceipts,
    OrderFinanceApiError,
} from '../../api/orderFinance';

// Courier payment history — one row per admin pay action (salary paid to a courier, or COD
// the courier handed in). Shared by the admin Finance history (`admin`, with a courier
// picker) and the courier's own read-only settlements page.

const gel = (n: number) => `₾${n.toFixed(2)}`;
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const isoToday = () => isoDate(new Date());

const inputStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '1rem',
    padding: '5px 8px', outline: 'none',
};
const navBtn: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.95rem',
    width: 32, height: 32, cursor: 'pointer', lineHeight: 1,
};
const cell: React.CSSProperties = {
    border: '1px solid var(--color-border)', padding: '6px 8px',
    fontSize: '0.78rem', color: 'var(--color-text)', verticalAlign: 'top',
};
const head: React.CSSProperties = {
    ...cell, background: 'var(--color-bg-2)', fontWeight: 700, fontSize: '0.62rem',
    textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-subtle)',
    whiteSpace: 'nowrap', textAlign: 'left',
};

export function CourierPaymentReceiptsPanel({ token, admin = false }: { token: string; admin?: boolean }) {
    const { t } = useLanguage();
    const [courierId, setCourierId] = useState('');                 // '' = all couriers (admin only)
    const [mode, setMode] = useState<'day' | 'month' | 'range'>('month');
    const [date, setDate] = useState(isoToday());
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const couriersQuery = useQuery({
        queryKey: ['admin', 'couriers'] as const,
        queryFn: () => fetchCouriers(token),
        enabled: admin && !!token,
    });
    const couriers = couriersQuery.data ?? [];

    const opts = mode === 'range'
        ? { from: from || undefined, to: to || undefined }
        : { date: date || undefined, monthly: mode === 'month' };

    const receiptsQuery = useQuery({
        queryKey: [admin ? 'admin' : 'courier', 'finance', 'courierPaymentReceipts', courierId, mode, date, from, to] as const,
        queryFn: () => admin
            ? fetchCourierPaymentReceiptsAdmin(token, { ...opts, courierId: courierId || undefined })
            : fetchMyCourierPaymentReceipts(token, opts),
        enabled: !!token,
    });
    const receipts = receiptsQuery.data ?? [];
    const error = receiptsQuery.isError
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
    const atToday = mode === 'month' ? date.slice(0, 7) >= isoToday().slice(0, 7) : date >= isoToday();

    const totalSalary = receipts.filter(r => r.flow === 'CourierSalary').reduce((s, r) => s + r.totalAmount, 0);
    const totalCod    = receipts.filter(r => r.flow === 'CourierCodTransfer').reduce((s, r) => s + r.totalAmount, 0);
    const colCount = admin ? 7 : 6;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Courier picker (admin) + date filter */}
            <div className="content-card" style={{ padding: '10px 14px', overflow: 'visible', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                {admin && (
                    <select value={courierId} onChange={e => setCourierId(e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                        <option value="">{t.courierRcptAllCouriers}</option>
                        {couriers.map(c => (
                            <option key={c.courierId} value={c.courierId}>{c.fullName}{c.isDeleted ? ' (inactive)' : ''}</option>
                        ))}
                    </select>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: admin ? 'auto' : 0, flexWrap: 'wrap' }}>
                    <div className="go-seg" style={{ display: 'inline-flex' }}>
                        <button className={`go-seg__btn ${mode === 'day' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('day')}>{t.ofinViewDaily}</button>
                        <button className={`go-seg__btn ${mode === 'month' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('month')}>{t.ofinViewMonthly}</button>
                        <button className={`go-seg__btn ${mode === 'range' ? 'go-seg__btn--active' : ''}`} onClick={() => setMode('range')}>{t.ofinViewRange}</button>
                    </div>
                    {mode === 'day' && (
                        <>
                            <button onClick={() => shiftDay(-1)} title={t.statPrevDay} style={navBtn}>‹</button>
                            <input type="date" value={date} max={isoToday()} onChange={e => setDate(e.target.value)} style={inputStyle} />
                            <button onClick={() => !atToday && shiftDay(1)} disabled={atToday} title={t.statNextDay}
                                style={{ ...navBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                        </>
                    )}
                    {mode === 'month' && (
                        <>
                            <button onClick={() => shiftMonth(-1)} title={t.ofinPrevMonth} style={navBtn}>‹</button>
                            <input type="month" value={date.slice(0, 7)} max={isoToday().slice(0, 7)}
                                onChange={e => setDate(e.target.value ? e.target.value + '-01' : '')} style={inputStyle} />
                            <button onClick={() => !atToday && shiftMonth(1)} disabled={atToday} title={t.ofinNextMonth}
                                style={{ ...navBtn, opacity: atToday ? 0.4 : 1, cursor: atToday ? 'not-allowed' : 'pointer' }}>›</button>
                        </>
                    )}
                    {mode === 'range' && (
                        <>
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvFrom}</span>
                            <input type="date" value={from} max={to || isoToday()} onChange={e => setFrom(e.target.value)} style={inputStyle} />
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finOvTo}</span>
                            <input type="date" value={to} min={from || undefined} max={isoToday()} onChange={e => setTo(e.target.value)} style={inputStyle} />
                        </>
                    )}
                </div>
            </div>

            {error && (
                <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem' }}>
                    {error}
                </div>
            )}

            {receiptsQuery.isPending ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="go-spinner" style={{ margin: '0 auto' }} />
                </div>
            ) : receipts.length === 0 ? (
                <div className="content-card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
                    {t.finPayHistNone}
                </div>
            ) : (
                <div className="content-card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '0.8rem' }}>
                        <span><span style={{ color: 'var(--color-text-subtle)' }}>{t.courierRcptSalary}: </span><strong style={{ color: '#059669' }}>{gel(totalSalary)}</strong></span>
                        <span><span style={{ color: 'var(--color-text-subtle)' }}>{t.courierRcptCodTransfer}: </span><strong style={{ color: 'var(--color-accent)' }}>{gel(totalCod)}</strong></span>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                            <thead>
                                <tr>
                                    <th style={{ ...head, textAlign: 'center' }}>#</th>
                                    <th style={head}>{t.finPayHistThDate}</th>
                                    {admin && <th style={head}>{t.courierRcptThCourier}</th>}
                                    <th style={head}>{t.finPayHistThType}</th>
                                    <th style={{ ...head, textAlign: 'right' }}>{t.finPayHistThOrders}</th>
                                    <th style={{ ...head, textAlign: 'right' }}>{t.finPayHistThAmount}</th>
                                    <th style={head}> </th>
                                </tr>
                            </thead>
                            <tbody>
                                {receipts.map((r, i) => {
                                    const expanded = expandedId === r.id;
                                    const isSalary = r.flow === 'CourierSalary';
                                    return (
                                        <Fragment key={r.id}>
                                            <tr onClick={() => setExpandedId(expanded ? null : r.id)} style={{ cursor: 'pointer' }}>
                                                <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>{i + 1}</td>
                                                <td style={{ ...cell, fontWeight: 700 }}>{new Date(r.paidAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', year: 'numeric', month: 'numeric', day: 'numeric' })}</td>
                                                {admin && <td style={cell}>{r.courierName ?? '—'}</td>}
                                                <td style={cell}>
                                                    <span style={{
                                                        fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 100,
                                                        background: isSalary ? 'rgba(5,150,105,0.1)' : 'var(--color-accent-dim)',
                                                        color: isSalary ? '#059669' : 'var(--color-accent)',
                                                        border: `1px solid ${isSalary ? 'rgba(5,150,105,0.2)' : 'var(--color-accent)'}`,
                                                    }}>
                                                        {isSalary ? t.courierRcptSalary : t.courierRcptCodTransfer}
                                                    </span>
                                                </td>
                                                <td style={{ ...cell, textAlign: 'right' }}>{r.orders.length}</td>
                                                <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{gel(r.totalAmount)}</td>
                                                <td style={{ ...cell, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
                                                    <span style={{ display: 'inline-block', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                                                </td>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan={colCount} style={{ padding: 0, borderBottom: '1px solid var(--color-border)' }}>
                                                        <div style={{ overflowX: 'auto', padding: '0 14px 12px' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                                                                <thead>
                                                                    <tr>
                                                                        <th style={head}>{t.finPayHistThTracking}</th>
                                                                        <th style={head}>{t.finPayHistThRecipient}</th>
                                                                        <th style={head}>{t.finPayHistThAddress}</th>
                                                                        <th style={{ ...head, textAlign: 'right' }}>{t.finPayHistThAmount}</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {r.orders.map(o => (
                                                                        <tr key={o.orderId}>
                                                                            <td style={cell}>{o.trackingNumber}</td>
                                                                            <td style={cell}>{o.recipientName}</td>
                                                                            <td style={cell}>{o.recipientAddress}</td>
                                                                            <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{gel(o.amount)}</td>
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
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
