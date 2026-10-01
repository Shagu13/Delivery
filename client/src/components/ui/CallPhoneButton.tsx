import { useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { sanitizeGeorgianMobile } from './GeorgianPhoneField';
import { ConfirmDialog } from './ConfirmDialog';
import './CallPhoneButton.css';

/**
 * A phone number the courier can tap: asks "Call this number?" first, and only on confirm opens
 * the phone dialer. Stored numbers are the bare 9-digit local number, so `+995` is prepended for
 * the tel: link. Falls back to plain text when the number can't be dialled.
 */
export function CallPhoneButton({ phone }: { phone: string }) {
    const { t } = useLanguage();
    const [asking, setAsking] = useState(false);
    const local = sanitizeGeorgianMobile(phone);

    if (!local) return <span>{phone}</span>;

    const confirmCall = () => {
        setAsking(false);
        window.location.href = `tel:+995${local}`;
    };

    return (
        <>
            <button type="button" className="call-phone-btn" onClick={() => setAsking(true)}>
                📞 {phone}
            </button>
            <ConfirmDialog
                open={asking}
                title={t.callPhoneTitle}
                message={t.callPhoneMessage(phone)}
                confirmLabel={t.phoneActionsCall}
                onConfirm={confirmCall}
                onCancel={() => setAsking(false)}
            />
        </>
    );
}
