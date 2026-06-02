import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AdminOrderItem } from './AdminOrdersPage';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
    order: AdminOrderItem | null;
    open: boolean;
    onClose: () => void;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    if (value === null || value === undefined || value === '') return null;
    return (
        <div className="vom-row">
            <span className="vom-label">{label}</span>
            <span className="vom-value">{value}</span>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="vom-section">
            <div className="vom-section-title">{title}</div>
            {children}
        </div>
    );
}

export function ViewOrderModal({ order, open, onClose }: Props) {
    const { lang } = useLanguage();

    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [open, onClose]);

    if (!open || !order) return null;

    const [bg, color] = STATUS_COLORS[order.status] ?? ['rgba(160,120,0,0.12)', '#c4870f'];
    const statusMeta  = getStatusMeta(order.status, lang);
    const city        = lang === 'ka' && order.recipientCityGeo     ? order.recipientCityGeo     : order.recipientCity;
    const district    = lang === 'ka' && order.recipientDistrictGeo ? order.recipientDistrictGeo : order.recipientDistrict;

    const formatDate = (iso: string | null) => {
        if (!iso) return null;
        return new Date(iso).toLocaleString();
    };

    const revenue = order.companyRevenue != null
        ? `₾${order.companyRevenue.toFixed(2)}`
        : (order.companyServicePrice && order.courierSalary != null)
            ? `₾${(order.companyServicePrice - order.courierSalary).toFixed(2)} (calculated)`
            : null;

    return createPortal(
        <>
            <div className="modal-backdrop" onClick={onClose} />
            <div className="modal vom-modal" role="dialog" aria-modal="true">

                {/* Header */}
                <div className="modal__header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span className="tn-badge" style={{ fontSize: '0.9rem' }}>{order.trackingNumber}</span>
                        {order.orderType !== 'Send' && (
                            <span style={{
                                fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em',
                                padding: '2px 8px', borderRadius: 99,
                                background: order.orderType === 'Return' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                                color: order.orderType === 'Return' ? '#ef4444' : '#3b82f6',
                                border: `1px solid ${order.orderType === 'Return' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)'}`,
                                textTransform: 'uppercase',
                            }}>
                                {order.orderType}
                            </span>
                        )}
                        <span className="status-badge" style={{ background: bg, color }}>{statusMeta.short}</span>
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="modal__body vom-body">

                    <Section title="Order Info">
                        <Row label="Status"       value={<span className="status-badge" style={{ background: bg, color }}>{statusMeta.label ?? statusMeta.short}</span>} />
                        <Row label="Type"         value={order.orderType} />
                        <Row label="Created"      value={formatDate(order.createdAt)} />
                        <Row label="Delivered"    value={formatDate(order.deliveredAt)} />
                        {order.isFragile && <Row label="Fragile" value="⚠ Yes" />}
                        {order.description && <Row label="Description" value={order.description} />}
                    </Section>

                    <Section title="Sender">
                        <Row label="Business"  value={order.senderBusinessName} />
                        <Row label="Name"      value={`${order.senderFirstName} ${order.senderLastName}`.trim()} />
                        <Row label="Phone"     value={order.senderPhone} />
                    </Section>

                    <Section title="Recipient">
                        <Row label="Name"     value={`${order.recipientFirstName} ${order.recipientLastName}`.trim()} />
                        <Row label="Phone"    value={order.recipientPhone} />
                        <Row label="City"     value={city} />
                        <Row label="District" value={district} />
                        <Row label="Address"  value={order.recipientAddress} />
                    </Section>

                    {order.orderType === 'Return' && (order.returnPickupCity || order.returnPickupAddress) && (
                        <Section title="Return Pickup Address">
                            <Row label="City"     value={order.returnPickupCity} />
                            <Row label="District" value={order.returnPickupDistrict} />
                            <Row label="Address"  value={order.returnPickupAddress} />
                        </Section>
                    )}

                    <Section title="Financials">
                        <Row label="Service Payer"   value={order.whoPaysForCompanyService} />
                        <Row label="Payment Status"  value={order.productPaymentStatus} />
                        {order.amountToCollectForPackage != null && (
                            <Row label="COD Amount" value={`₾${order.amountToCollectForPackage.toFixed(2)}`} />
                        )}
                        <Row label="Service Price"  value={order.companyServicePrice > 0 ? `₾${order.companyServicePrice.toFixed(2)}` : '—'} />
                        <Row label="Courier Salary" value={order.courierSalary != null ? `₾${order.courierSalary.toFixed(2)}` : '—'} />
                        <Row label="Revenue"        value={revenue} />
                    </Section>

                </div>

                {/* Footer */}
                <div className="modal__footer" style={{ padding: '14px 24px' }}>
                    <button className="modal__btn-cancel" onClick={onClose}>Close</button>
                </div>
            </div>

            <style>{`
                .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
                .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22);animation:modal-slide-up 0.22s ease both; }
                .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1;gap:12px; }
                .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition);flex-shrink:0; }
                .modal__close:hover { background:var(--color-border); }
                .modal__body { padding:20px 24px;display:flex;flex-direction:column;gap:14px; }
                .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid var(--color-border); }
                .modal__btn-cancel { padding:9px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer; }
                .modal__btn-cancel:hover { background:var(--color-bg-3); }
                @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
                @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 12px))} to{opacity:1;transform:translate(-50%,-50%)} }

                .vom-modal { width:min(520px,calc(100vw - 32px)); }
                .vom-body { gap: 16px; }
                .vom-section { border:1px solid var(--color-border);border-radius:var(--radius-sm);overflow:hidden; }
                .vom-section-title { font-size:0.65rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-text-subtle);padding:8px 14px;background:var(--color-bg-3);border-bottom:1px solid var(--color-border); }
                .vom-row { display:flex;align-items:baseline;gap:8px;padding:7px 14px;border-bottom:1px solid var(--color-border); }
                .vom-row:last-child { border-bottom:none; }
                .vom-label { font-size:0.72rem;font-weight:700;color:var(--color-text-subtle);min-width:110px;flex-shrink:0;text-transform:uppercase;letter-spacing:0.04em; }
                .vom-value { font-size:0.85rem;color:var(--color-text);font-weight:500;word-break:break-word; }
            `}</style>
        </>,
        document.body
    );
}
