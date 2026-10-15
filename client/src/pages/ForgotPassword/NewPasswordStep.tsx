import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetPassword } from '../../api/auth';
import { FormField } from '../../components/ui/FormField';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { firstPasswordError } from '../../utils/passwordRules';
import { useLanguage } from '../../contexts/useLanguage';
import { ErrorBanner } from './ErrorBanner';
import { resetErrorMessage } from './resetErrors';
import '../Login/login.css';

/** Step 3 — choose the new password; the ticket from the code step authorises it. */
export function NewPasswordStep({ ticket }: { ticket: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [form, setForm] = useState({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<typeof form>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(f => ({ ...f, [field]: e.target.value }));
      setErrors(prev => ({ ...prev, [field]: undefined }));
      setApiError(null);
    };

  const validate = (): boolean => {
    const e: Partial<typeof form> = {};
    const pwdErr = firstPasswordError(form.newPassword, t);
    if (pwdErr) e.newPassword = pwdErr;
    if (form.newPassword !== form.confirmPassword)
      e.confirmPassword = t.errPasswordMismatch;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await resetPassword({
        ticket,
        newPassword:        form.newPassword,
        confirmNewPassword: form.confirmPassword,
      });
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setApiError(resetErrorMessage(err, t, t.resetPwdFailed));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      {apiError && <ErrorBanner message={apiError} />}

      <FormField
        label={t.custNewPassword}
        type="password"
        autoComplete="new-password"
        value={form.newPassword}
        onChange={set('newPassword')}
        error={errors.newPassword}
        placeholder={t.custNewPasswordPh}
        autoFocus
      />
      <PasswordRequirements value={form.newPassword} />
      <FormField
        label={t.custConfirmNewPassword}
        type="password"
        autoComplete="new-password"
        value={form.confirmPassword}
        onChange={set('confirmPassword')}
        error={errors.confirmPassword}
        placeholder={t.custRepeatNewPassword}
      />

      <button type="submit" className="login-form__submit" disabled={loading}>
        {loading
          ? <><span className="spinner" />{t.resetPwdSubmitting}</>
          : t.resetPwdSubmit}
      </button>
    </form>
  );
}
