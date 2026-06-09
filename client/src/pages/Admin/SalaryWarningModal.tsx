import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/useLanguage';

interface SalaryWarningModalProps {
    /** How many orders are missing a salary — drives the body message. */
    orderCount: number;
    /** Dismiss the warning without assigning. */
    onCancel: () => void;
    /** Open the salary-fill flow. */
    onFillSalaries: () => void;
    /**
     * When supplied, shows a "Proceed anyway" button that assigns without a
     * salary. Omit it (e.g. the Packages bulk flow) to hide the button.
     */
    onProceedAnyway?: () => void;
}

const overlayStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const cardStyle: React.CSSProperties = {
    background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 12,
    padding: '28px 32px', maxWidth: 420, width: '90%', textAlign: 'center',
    boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
};
const secondaryBtn: React.CSSProperties = {
    padding: '8px 20px', borderRadius: 7, border: '1px solid var(--color-border)',
    background: 'var(--color-bg-3)', color: 'var(--color-text)', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 600,
};
const primaryBtn: React.CSSProperties = {
    padding: '8px 20px', borderRadius: 7, border: 'none',
    background: 'var(--color-accent)', color: '#fff', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 600,
};

/**
 * Warning shown when an admin tries to assign a courier to order(s) that have
 * no courier salary set. Shared by the Packages page and the Return & Exchange
 * page so both stay visually and textually in sync (translated).
 */
export function SalaryWarningModal({ orderCount, onCancel, onFillSalaries, onProceedAnyway }: SalaryWarningModalProps) {
    const { t } = useLanguage();
    return createPortal(
        <div style={overlayStyle}>
            <div style={cardStyle}>
                <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 8, color: 'var(--color-text)' }}>{t.aopSalaryWarnTitle}</div>
                <div style={{ fontSize: '0.88rem', color: 'var(--color-text-subtle)', marginBottom: 24, lineHeight: 1.5 }}>
                    {t.aopSalaryWarnBody(orderCount)}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <button onClick={onCancel} style={secondaryBtn}>{t.cancel}</button>
                    {onProceedAnyway && (
                        <button onClick={onProceedAnyway} style={secondaryBtn}>{t.aopProceedAnyway}</button>
                    )}
                    <button onClick={onFillSalaries} style={primaryBtn}>{t.aopFillSalaries}</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
