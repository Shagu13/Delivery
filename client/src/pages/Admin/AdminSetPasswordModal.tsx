import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { FormField } from '../../components/ui/FormField';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { adminSetCustomerPassword, CustomerApiError, type AdminCustomer } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';
import { firstPasswordError } from '../../utils/passwordRules';
import '../../components/ui/Modal.css';

interface Props {
  customer: AdminCustomer | null;
  onClose: () => void;
  onDone: () => void;
}

/** Admin override: set a new password for a customer without the old one. */
export function AdminSetPasswordModal({ customer, onClose, onDone }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors]   = useState<{ newPassword?: string; confirmPassword?: string }>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    setNewPassword(''); setConfirmPassword(''); setErrors({}); setApiError(null);
  }, [customer]);

  if (!customer) return null;

  const validate = (): boolean => {
    const e: typeof errors = {};
    const pwdErr = firstPasswordError(newPassword, t);
    if (pwdErr) e.newPassword = pwdErr;
    if (newPassword !== confirmPassword) e.confirmPassword = t.errPasswordMismatch;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !token) return;
    setLoading(true);
    setApiError(null);
    try {
      await adminSetCustomerPassword(customer.id, {
        newPassword, confirmNewPassword: confirmPassword,
      }, token);
      onDone();
    } catch (err) {
      if (err instanceof CustomerApiError && err.errors) {
        const msg = Object.values(err.errors).flat()[0];
        setApiError(msg ?? err.message);
      } else {
        setApiError(err instanceof CustomerApiError ? err.message : t.acupSetPwdFail);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.acupSetPwdTitle}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {t.acupSetPwdFor(`${customer.firstName} ${customer.lastName}`, customer.email)}
          </p>

          <FormField
            label={t.custNewPassword}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setErrors(p => ({ ...p, newPassword: undefined })); setApiError(null); }}
            error={errors.newPassword}
            placeholder={t.custNewPasswordPh}
            autoFocus
          />
          <div style={{ margin: '8px 0 14px' }}>
            <PasswordRequirements value={newPassword} />
          </div>
          <FormField
            label={t.custConfirmNewPassword}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setErrors(p => ({ ...p, confirmPassword: undefined })); setApiError(null); }}
            error={errors.confirmPassword}
            placeholder={t.custRepeatNewPassword}
          />

          {apiError && <div className="ui-modal__error" role="alert">{apiError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose} disabled={loading}>
            {t.cancel}
          </button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.custSaving : t.acupSetPwdSave}
          </button>
        </div>
      </div>
    </div>
  );
}
