import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import type { CourierOrder } from '../../../api/orders';

interface CollectConfirmModalProps {
    order: CourierOrder;
    isBusy: boolean;
    onCancel: () => void;
    /** Courier collected the cash normally. `updatedAmount` is set when the courier corrected
     *  the parcel amount at the door (e.g. the recipient negotiated a different price). */
    onConfirm: (updatedAmount?: number) => void;
    /** Recipient had already paid the sender directly; feeAlsoToSender = the service fee went to the sender too. */
    onPaidToSender: (feeAlsoToSender: boolean) => void;
}

export function CollectConfirmModal({ order, isBusy, onCancel, onConfirm, onPaidToSender }: CollectConfirmModalProps) {
    const { t } = useLanguage();
    const hasProductAmount = order.productPaymentStatus === 'NotPaid' && order.amountToCollectForPackage != null && order.amountToCollectForPackage > 0;
    const hasServiceFee = order.companyServicePrice > 0 && order.whoPaysForCompanyService === 'Recipient';

    // The courier can correct the parcel (COD) amount at the door when the recipient
    // negotiated a different price than what the sender originally set. `null` = unedited.
    const [codOverride, setCodOverride] = useState<number | null>(null);
    const [editingAmount, setEditingAmount] = useState(false);
    const [amountInput, setAmountInput] = useState(() =>
        hasProductAmount ? order.amountToCollectForPackage!.toFixed(2) : '0.00');

    const productAmount = codOverride ?? (hasProductAmount ? order.amountToCollectForPackage! : 0);
    const total = productAmount + (hasServiceFee ? order.companyServicePrice : 0);

    const saveAmount = () => {
        const n = Number(amountInput);
        if (isNaN(n) || n < 0) return;
        setCodOverride(n);
        setEditingAmount(false);
    };
    const cancelAmountEdit = () => {
        setAmountInput(productAmount.toFixed(2));
        setEditingAmount(false);
    };

    // 'main' = collect-or-paid-to-sender; 'fee' = ask whether the fee also went to the sender.
    const [step, setStep] = useState<'main' | 'fee'>('main');

    const handlePaidToSender = () => {
        if (hasServiceFee) setStep('fee');
        else onPaidToSender(false);
    };

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.50)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '14px', padding: '24px 20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.28)', textAlign: 'center' }}>
                {step === 'main' ? (
                    <>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>💰</div>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 700 }}>{t.cdCollectTitle}</h3>
                        <p style={{ margin: '0 0 14px', fontSize: '0.875rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{t.cdCollectSubtitle}</p>
                        <div style={{ margin: '0 0 10px', padding: '12px 16px', borderRadius: '10px', background: '#fef9c3', border: '1px solid #fde047', width: '100%' }}>
                            <div style={{ fontSize: '0.72rem', color: '#92400e', marginBottom: 2, fontWeight: 700, letterSpacing: '0.05em' }}>{t.cdCollectTotal}</div>
                            {editingAmount ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', marginTop: 4 }}>
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#92400e', textAlign: 'left', lineHeight: 1.4 }}>{t.cdCollectChangeHint}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#92400e' }}>₾</span>
                                        <input type="number" min="0" step="0.01" autoFocus value={amountInput}
                                            onChange={e => setAmountInput(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') saveAmount(); if (e.key === 'Escape') cancelAmountEdit(); }}
                                            style={{ flex: 1, textAlign: 'right', fontSize: '1.2rem', fontWeight: 800, color: '#92400e', background: '#fff', border: '1px solid #fde047', borderRadius: '6px', padding: '4px 8px', outline: 'none' }} />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button onClick={cancelAmountEdit} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: '1px solid #fde047', background: 'transparent', color: '#92400e', cursor: 'pointer', fontWeight: 600, fontSize: '0.78rem' }}>{t.cdCollectChangeCancel}</button>
                                        <button onClick={saveAmount} style={{ flex: 1, padding: '8px', borderRadius: '7px', border: 'none', background: '#92400e', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: '0.78rem' }}>{t.cdCollectChangeSave}</button>
                                    </div>
                                </div>
                            ) : (
                                <span style={{ fontSize: '1.7rem', fontWeight: 800, color: '#92400e', letterSpacing: '-0.5px' }}>₾{total.toFixed(2)}</span>
                            )}
                        </div>
                        {hasProductAmount && !editingAmount && (
                            <button disabled={isBusy} onClick={() => { setAmountInput(productAmount.toFixed(2)); setEditingAmount(true); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, margin: '0 0 14px', padding: '5px 12px', borderRadius: '100px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: isBusy ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.76rem' }}>
                                ✏️ {t.cdCollectChange}
                            </button>
                        )}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                            <button onClick={onCancel} disabled={isBusy || editingAmount} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>{t.cdCollectNo}</button>
                            <button disabled={isBusy || editingAmount} onClick={() => onConfirm(codOverride ?? undefined)} style={{ flex: 1, padding: '11px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#fff', cursor: (isBusy || editingAmount) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: (isBusy || editingAmount) ? 0.6 : 1 }}>{t.cdCollectYes}</button>
                        </div>
                        <button disabled={isBusy || editingAmount} onClick={handlePaidToSender}
                            style={{ width: '100%', padding: '11px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: (isBusy || editingAmount) ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}>
                            {t.cdCollectPaidToSender}
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 14px' }}>↔️</div>
                        <h3 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, lineHeight: 1.4 }}>{t.cdCollectFeeQuestion(order.companyServicePrice.toFixed(2))}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button disabled={isBusy} onClick={() => onPaidToSender(true)}
                                style={{ padding: '11px', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', cursor: isBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem', opacity: isBusy ? 0.6 : 1 }}>
                                {t.cdCollectFeeToSender}
                            </button>
                            <button disabled={isBusy} onClick={() => onPaidToSender(false)}
                                style={{ padding: '11px', borderRadius: '8px', border: '1px solid #10b981', background: 'transparent', color: '#10b981', cursor: isBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.875rem' }}>
                                {t.cdCollectFeeCash}
                            </button>
                            <button onClick={() => setStep('main')} disabled={isBusy} style={{ padding: '9px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '0.82rem' }}>{t.cdCollectBack}</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
