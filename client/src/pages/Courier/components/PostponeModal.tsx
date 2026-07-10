import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import type { PostponeReason } from '../../../api/orders';
import { POSTPONE_REASON_LABELS } from '../../../api/orders';

interface PostponeModalProps {
    isBusy: boolean;
    onCancel: () => void;
    onConfirm: (reason: PostponeReason, comment?: string) => void;
}

export function PostponeModal({ isBusy, onCancel, onConfirm }: PostponeModalProps) {
    const { t } = useLanguage();
    const [selected, setSelected] = useState<PostponeReason | null>(null);
    const [comment, setComment] = useState('');
    const canConfirm = selected !== null && (selected !== 'Other' || comment.trim().length > 0);

    return (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div style={{ background: 'var(--color-bg)', borderRadius: '12px', padding: '20px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 700 }}>{t.cdPostponeTitle}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {(Object.keys(POSTPONE_REASON_LABELS) as PostponeReason[]).map(reason => (
                        <button key={reason} onClick={() => setSelected(reason)}
                            style={{ padding: '10px 12px', borderRadius: '8px',
                                border: selected === reason ? '2px solid var(--color-accent)' : '1px solid var(--color-border)',
                                background: selected === reason ? 'var(--color-accent-dim)' : 'transparent',
                                textAlign: 'left', cursor: 'pointer', fontSize: '0.875rem',
                                fontWeight: selected === reason ? 600 : 400 }}>
                            {t.cdPostponeReasons[reason]}
                        </button>
                    ))}
                </div>
                {selected === 'Other' && (
                    <textarea
                        autoFocus
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder={t.cdPostponeCommentPlaceholder}
                        maxLength={500}
                        rows={3}
                        style={{ width: '100%', boxSizing: 'border-box', marginBottom: '16px', padding: '10px 12px',
                            borderRadius: '8px', border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
                            color: 'var(--color-text)', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)', background: 'transparent', cursor: 'pointer', fontSize: '0.875rem' }}>
                        {t.cancel}
                    </button>
                    <button disabled={!canConfirm || isBusy} onClick={() => selected && onConfirm(selected, comment.trim() || undefined)}
                        style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                            background: canConfirm ? '#f97316' : 'var(--color-bg-3)',
                            color: canConfirm ? '#fff' : 'var(--color-text-muted)',
                            cursor: canConfirm ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: '0.875rem' }}>
                        {t.goConfirm}
                    </button>
                </div>
            </div>
        </div>
    );
}
