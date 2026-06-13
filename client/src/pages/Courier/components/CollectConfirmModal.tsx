import { useLanguage } from '../../../contexts/useLanguage';
import type { CourierOrder } from '../../../api/orders';

interface CollectConfirmModalProps {
    order: CourierOrder;
    isBusy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

export function CollectConfirmModal({ order, isBusy, onCancel, onConfirm }: CollectConfirmModalProps) {
    const { t } = useLanguage();
    const hasProductAmount = order.productPaymentStatus === 'NotPaid' && order.amountToCollectForPackage != null && order.amountToCollectForPackage > 0;
    const hasServiceFee = order.companyServicePrice > 0 && order.whoPaysForCompanyService === 'Recipient';
    const total = (hasProductAmount ? order.amountToCollectForPackage! : 0) + (hasServiceFee ? order.companyServicePrice : 0);

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.50)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '14px', padding: '24px 20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>💰</div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700 }}>{t.cdCollectTitle}</h3>
                <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{t.cdCollectSubtitle}</p>
                <div style={{ margin: '0 0 20px', padding: '12px 16px', borderRadius: '10px', background: '#fef9c3', border: '1px solid #fde047', width: '100%' }}>
                    <div style={{ fontSize: '0.72rem', color: '#92400e', marginBottom: 2, fontWeight: 700, letterSpacing: '0.05em' }}>{t.cdCollectTotal}</div>
                    <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#92400e', letterSpacing: '-0.5px' }}>₾{total.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={onCancel} disabled={isBusy} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>{t.cdCollectNo}</button>
                    <button disabled={isBusy} onClick={onConfirm} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', cursor: isBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: isBusy ? 0.6 : 1 }}>{t.cdCollectYes}</button>
                </div>
            </div>
        </div>
    );
}
