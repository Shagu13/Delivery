import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import type { CancellationReason } from '../../../api/orders';
import { CANCELLATION_REASON_LABELS, NON_BILLABLE_CANCEL_REASONS } from '../../../api/orders';

interface CancelModalProps {
    isBusy: boolean;
    onCancel: () => void;
    onConfirm: (reason: CancellationReason, comment?: string) => void;
}

export function CancelModal({ isBusy, onCancel, onConfirm }: CancelModalProps) {
    const { t } = useLanguage();
    const [selected, setSelected] = useState<CancellationReason | null>(null);
    const [comment, setComment] = useState('');

    // "Other" requires a comment before confirming.
    const canConfirm = selected !== null && (selected !== 'Other' || comment.trim().length > 0);

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>{t.cdCancelTitle}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(Object.keys(CANCELLATION_REASON_LABELS) as CancellationReason[]).map(reason => {
                        // Green = the customer is NOT charged (no delivery service rendered); red = billable.
                        const reasonColor = NON_BILLABLE_CANCEL_REASONS.has(reason) ? '#059669' : '#dc2626';
                        return (
                        <button key={reason} onClick={() => setSelected(reason)}
                            style={{ padding: '10px 12px', borderRadius: '8px',
                                border: selected === reason ? `2px solid ${reasonColor}` : '1px solid var(--color-border)',
                                background: selected === reason ? 'var(--color-accent-dim)' : 'transparent',
                                textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem',
                                color: reasonColor,
                                fontWeight: selected === reason ? 700 : 500 }}>
                            {t.cdCancelReasons[reason]}
                        </button>
                        );
                    })}
                    {selected === 'Other' && (
                        <textarea
                            value={comment}
                            onChange={e => setComment(e.target.value)}
                            placeholder={t.cdCancelCommentPlaceholder}
                            rows={3}
                            maxLength={500}
                            autoFocus
                            style={{ marginTop: '2px', padding: '10px 12px', borderRadius: '8px',
                                border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
                                color: 'var(--color-text)', fontSize: '0.875rem', fontFamily: 'var(--font-body)',
                                resize: 'vertical', boxSizing: 'border-box', width: '100%' }}
                        />
                    )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem' }}>
                        {t.cancel}
                    </button>
                    <button disabled={!canConfirm || isBusy} onClick={() => selected && onConfirm(selected, selected === 'Other' ? comment.trim() : undefined)}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                            background: canConfirm ? '#dc2626' : 'var(--color-bg-3)',
                            color: canConfirm ? '#fff' : 'var(--color-text-muted)',
                            cursor: canConfirm ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.875rem' }}>
                        {t.goConfirm}
                    </button>
                </div>
            </div>
        </div>
    );
}
