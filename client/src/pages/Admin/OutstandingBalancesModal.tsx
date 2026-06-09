import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchCustomersWithOutstanding, CustomerSettlementApiError } from '../../api/customerSettlements';
import type { CustomerOutstanding } from '../../api/customerSettlements';

const gel = (n: number) => `₾${n.toFixed(2)}`;

// red  = company owes the customer (COD)
// purple = customer owes the company (service fees)
const RED = '#ef4444';
const PURPLE = '#8b5cf6';

interface Props {
    token: string;
    onClose: () => void;
}

export function OutstandingBalancesModal({ token, onClose }: Props) {
    const { t } = useLanguage();
    const [rows, setRows] = useState<CustomerOutstanding[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        fetchCustomersWithOutstanding(token)
            .then(d => { if (!cancelled) setRows(d); })
            .catch(e => { if (!cancelled) setError(e instanceof CustomerSettlementApiError ? e.message : t.finOutFailed); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [token, t.finOutFailed]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return createPortal(
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.55)', backdropFilter: 'blur(4px)', zIndex: 200 }} />
            <div role="dialog" aria-modal="true" style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201,
                width: 'min(640px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column',
                background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.22)',
            }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--color-border)' }}>
                    <div>
                        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{t.finOutTitle}</h2>
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', margin: '4px 0 0' }}>{t.finOutSubtitle}</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    </button>
                </div>

                {/* Legend */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '10px 24px', borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: RED }} />{t.finOutLegendCompany}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: PURPLE }} />{t.finOutLegendCustomer}
                    </span>
                </div>

                {/* Body */}
                <div style={{ overflowY: 'auto', padding: '8px 0' }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center' }}><div className="go-spinner" style={{ margin: '0 auto' }} /></div>
                    ) : error ? (
                        <div style={{ padding: '16px 24px', color: RED, fontSize: '0.85rem' }}>{error}</div>
                    ) : rows.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t.finOutNone}</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <th style={thLeft}>{t.finOutColCustomer}</th>
                                    <th style={thRight}><span style={{ color: RED }}>{t.finOutCompanyOwes}</span></th>
                                    <th style={thRight}><span style={{ color: PURPLE }}>{t.finOutOwesCompany}</span></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.customerId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                        <td style={{ padding: '10px 24px' }}>
                                            <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{r.businessName}</div>
                                            <div style={{ fontSize: '0.74rem', color: 'var(--color-text-subtle)' }}>
                                                {r.firstName} {r.lastName} · {r.phoneNumber}
                                            </div>
                                        </td>
                                        <td style={{ ...tdRight, color: r.outstandingCodOwedToCustomer > 0 ? RED : 'var(--color-text-subtle)', fontWeight: r.outstandingCodOwedToCustomer > 0 ? 700 : 400 }}>
                                            {r.outstandingCodOwedToCustomer > 0 ? gel(r.outstandingCodOwedToCustomer) : '—'}
                                        </td>
                                        <td style={{ ...tdRight, color: r.outstandingServiceOwedToCompany > 0 ? PURPLE : 'var(--color-text-subtle)', fontWeight: r.outstandingServiceOwedToCompany > 0 ? 700 : 400 }}>
                                            {r.outstandingServiceOwedToCompany > 0 ? gel(r.outstandingServiceOwedToCompany) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </>,
        document.body
    );
}

const thLeft: React.CSSProperties = { textAlign: 'left', padding: '8px 24px', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-subtle)' };
const thRight: React.CSSProperties = { ...thLeft, textAlign: 'right' };
const tdRight: React.CSSProperties = { padding: '10px 24px', textAlign: 'right', fontFamily: "'Courier New', monospace", whiteSpace: 'nowrap' };
