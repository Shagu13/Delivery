import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type Operator,
  fetchOperators,
  createOperator,
  updateOperator,
  deleteOperator,
  OperatorApiError,
} from '../../api/operators';
import { FormField } from '../../components/ui/FormField';
import { PasswordRequirements } from '../../components/ui/PasswordRequirements';
import { firstPasswordError } from '../../utils/passwordRules';
import { useLanguage } from '../../contexts/useLanguage';
import type { Translations } from '../../contexts/translations';

interface Props {
  token: string;
}

interface FormData {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
}

type FieldErrors = Partial<Record<keyof FormData, string>>;

const EMPTY: FormData = { firstName: '', lastName: '', username: '', password: '' };

// Maps backend validation errors (FluentValidation property names + ASP.NET Identity
// codes) to localized, field-level messages. Mirrors CreateCourierModal.
function mapServerErrors(errors: Record<string, string[]>, t: Translations): FieldErrors {
  const out: FieldErrors = {};
  const setOnce = (field: keyof FormData, msg: string) => { if (!out[field]) out[field] = msg; };

  for (const [rawKey, msgs] of Object.entries(errors)) {
    switch (rawKey) {
      case 'DuplicateUserName':
      case 'DuplicateEmail':
        setOnce('username', t.errUsernameTaken); continue;
      case 'InvalidUserName':
      case 'InvalidEmail':
        setOnce('username', t.errUsernameChars); continue;
      case 'PasswordTooShort':
        setOnce('password', t.errPasswordShort); continue;
      case 'PasswordRequiresUpper':
        setOnce('password', t.errPasswordUppercase); continue;
      case 'PasswordRequiresLower':
        setOnce('password', t.errPasswordLowercase); continue;
      case 'PasswordRequiresDigit':
        setOnce('password', t.errPasswordNumber); continue;
      case 'PasswordRequiresNonAlphanumeric':
        setOnce('password', t.errPasswordSymbol); continue;
    }
    if (rawKey.startsWith('Password')) { setOnce('password', t.errPasswordWeak); continue; }

    const bare = rawKey.includes('.') ? rawKey.slice(rawKey.lastIndexOf('.') + 1) : rawKey;
    const field = (bare.charAt(0).toLowerCase() + bare.slice(1)) as keyof FormData;
    if (field in EMPTY) setOnce(field, msgs?.[0] ?? t.errGenericValidation);
  }
  return out;
}

interface ModalProps {
  open: boolean;
  // When set, the modal edits this operator; otherwise it creates a new one.
  editing: Operator | null;
  token: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

function OperatorModal({ open, editing, token, onClose, onSaved }: ModalProps) {
  const { t } = useLanguage();
  const [form, setForm]               = useState<FormData>(EMPTY);
  const [errors, setErrors]           = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const isEdit = editing !== null;

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(editing
      ? { firstName: editing.firstName, lastName: editing.lastName, username: editing.username, password: '' }
      : EMPTY);
    setErrors({});
    setGlobalError(null);
    setShowPassword(false);
  }, [open, editing]);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => { const next = { ...prev }; delete next[field]; return next; });
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.firstName.trim()) e.firstName = t.errFirstNameRequired;
    if (!form.lastName.trim())  e.lastName  = t.errLastNameRequired;
    if (!form.username.trim())  e.username  = t.errUsernameRequired;
    else if (!/^[a-zA-Z0-9_.-]+$/.test(form.username)) e.username = t.errUsernameChars;

    // On create the password is required; on edit it's optional (blank = keep current).
    if (!isEdit && !form.password) e.password = t.errPasswordRequired;
    if (form.password) {
      const pwdErr = firstPasswordError(form.password, t);
      if (pwdErr) e.password = pwdErr;
    }
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) { setErrors(validationErrors); return; }
    if (!token) return;
    setSubmitting(true);
    try {
      if (isEdit && editing) {
        await updateOperator(editing.id, {
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          username:  form.username.trim(),
          newPassword: form.password ? form.password : null,
        }, token);
        onSaved(t.operatorUpdatedToast);
      } else {
        await createOperator({
          firstName: form.firstName.trim(),
          lastName:  form.lastName.trim(),
          username:  form.username.trim(),
          password:  form.password,
        }, token);
        onSaved(t.operatorCreatedToast);
      }
    } catch (err) {
      if (err instanceof OperatorApiError) {
        const mapped = err.errors ? mapServerErrors(err.errors, t) : {};
        if (Object.keys(mapped).length > 0) { setErrors(mapped); setGlobalError(null); }
        else setGlobalError(err.status === 422 ? t.errGenericValidation : err.message);
      } else {
        setGlobalError(t.errUnexpected);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // Portal to <body> so the fixed-position modal escapes the page's
  // content-card (overflow:hidden) and any transformed ancestor that would
  // otherwise become its containing block and clip it.
  return createPortal(
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="operator-modal-title">
        <div className="modal__header">
          <div>
            <p className="modal__eyebrow">{isEdit ? t.operatorModalEyebrowEdit : t.operatorModalEyebrowNew}</p>
            <h2 className="modal__title" id="operator-modal-title">{isEdit ? t.operatorModalTitleEdit : t.operatorModalTitleNew}</h2>
          </div>
          <button className="modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form className="modal__body" onSubmit={handleSubmit} noValidate>
          {globalError && (
            <div className="modal__global-error" role="alert">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {globalError}
            </div>
          )}

          <div className="modal__grid">
            <FormField label={t.firstName} required value={form.firstName} onChange={e => handleChange('firstName', e.target.value)} error={errors.firstName} placeholder={t.phFirstName} maxLength={100} autoFocus />
            <FormField label={t.lastName}  required value={form.lastName}  onChange={e => handleChange('lastName',  e.target.value)} error={errors.lastName}  placeholder={t.phLastName}  maxLength={100} />
          </div>

          <FormField label={t.username} required value={form.username} onChange={e => handleChange('username', e.target.value)} error={errors.username} placeholder={t.phUsername} maxLength={50} autoComplete="off" />

          <div className={`form-field ${errors.password ? 'form-field--error' : ''}`}>
            <label className="form-field__label">
              {isEdit ? t.operatorNewPassword : t.password}
              {!isEdit && <span className="form-field__required"> *</span>}
            </label>
            <div className="modal__password-wrap">
              <input
                className="form-field__input"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => handleChange('password', e.target.value)}
                placeholder={t.phPasswordMin}
                autoComplete="new-password"
              />
              <button type="button" className="modal__password-toggle" onClick={() => setShowPassword(p => !p)} aria-label={showPassword ? 'Hide' : 'Show'}>
                {showPassword
                  ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6A2 2 0 0010 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M3.5 4.6C2.2 5.6 1 7 1 8c0 0 2.5 5 7 5a7.3 7.3 0 003.4-.9M6 3.2A7 7 0 0115 8c-.4 1-1 2-1.7 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                  : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></svg>
                }
              </button>
            </div>
            {errors.password && <span className="form-field__error">{errors.password}</span>}
            {isEdit && !form.password && <span className="form-field__hint">{t.operatorPasswordKeepHint}</span>}
            {form.password && <PasswordRequirements value={form.password} />}
          </div>

          <div className="modal__footer">
            <button type="button" className="modal__btn-cancel" onClick={onClose} disabled={submitting}>{t.cancel}</button>
            <button type="submit" className="modal__btn-submit" disabled={submitting}>
              {submitting
                ? <><span className="btn__spinner" />{t.submitting}</>
                : isEdit ? t.operatorSubmitSave : t.operatorSubmitNew}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.45);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
        .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.18),0 4px 16px rgba(0,0,0,0.1);animation:modal-slide-up 0.22s ease both; }
        .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
        .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
        .modal__title { font-family:var(--font-display);font-size:1.3rem;font-weight:800;letter-spacing:-0.025em;color:var(--color-text);margin:0; }
        .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text-muted);cursor:pointer;transition:background var(--transition),color var(--transition);flex-shrink:0; }
        .modal__close:hover { background:var(--color-error-bg);color:var(--color-error);border-color:rgba(192,57,43,0.2); }
        .modal__body { padding:24px;display:flex;flex-direction:column;gap:18px; }
        .modal__global-error { display:flex;align-items:center;gap:9px;background:var(--color-error-bg);border:1px solid rgba(192,57,43,0.2);border-radius:var(--radius-sm);color:var(--color-error);font-size:0.84rem;font-weight:500;padding:10px 14px; }
        .modal__grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
        @media (max-width:480px) { .modal__grid { grid-template-columns:1fr; } }
        .modal__password-wrap { position:relative; }
        .modal__password-wrap .form-field__input { padding-right:42px; }
        .modal__password-toggle { position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--color-text-subtle);display:flex;align-items:center;padding:2px;transition:color var(--transition); }
        .modal__password-toggle:hover { color:var(--color-text-muted); }
        .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding-top:8px;border-top:1px solid var(--color-border); }
        .modal__btn-cancel { padding:10px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer;transition:background var(--transition),border-color var(--transition),color var(--transition); }
        .modal__btn-cancel:hover:not(:disabled) { background:var(--color-bg-3);border-color:var(--color-text-muted);color:var(--color-text); }
        .modal__btn-cancel:disabled { opacity:0.5;cursor:not-allowed; }
        .modal__btn-submit { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:var(--color-accent);border:none;border-radius:var(--radius-md);font-family:var(--font-body);font-size:0.875rem;font-weight:600;color:#fff;cursor:pointer;transition:background var(--transition),box-shadow var(--transition); }
        .modal__btn-submit:hover:not(:disabled) { background:#d4891a;box-shadow:0 4px 16px rgba(196,127,23,0.28); }
        .modal__btn-submit:disabled { opacity:0.6;cursor:not-allowed; }
        .form-field__hint { font-size:0.75rem;color:var(--color-text-subtle);margin-top:4px; }
        @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
        @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 16px))} to{opacity:1;transform:translate(-50%,-50%)} }
      `}</style>
    </>,
    document.body,
  );
}

export default function AdminOperatorsPage({ token }: Props) {
  const { t } = useLanguage();
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing]     = useState<Operator | null>(null);
  const [busyId, setBusyId]       = useState<string | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOperators(await fetchOperators(token));
      setError('');
    } catch {
      setError(t.operatorLoadFail);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit   = (op: Operator) => { setEditing(op); setModalOpen(true); };

  const handleSaved = (msg: string) => {
    setModalOpen(false);
    setEditing(null);
    showToast(msg);
    void load();
  };

  const handleDelete = async (op: Operator) => {
    if (!window.confirm(t.operatorDeleteConfirm)) return;
    setBusyId(op.id);
    try {
      await deleteOperator(op.id, token);
      setOperators(prev => prev.filter(x => x.id !== op.id));
      showToast(t.operatorDeletedToast);
    } catch {
      setError(t.operatorLoadFail);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>
      <div className="content-card__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="content-card__title">{t.topbarOperators}</span>
        <button className="btn-primary" onClick={openCreate}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.addOperator}
        </button>
      </div>

      {loading ? (
        <div className="go-loading"><div className="go-spinner" /></div>
      ) : error ? (
        <div className="go-error">{error}</div>
      ) : operators.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="14" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 34c0-6 5-10 12-10s12 4 12 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{t.operatorsEmpty}</span>
        </div>
      ) : (
        <div className="table-scroll">
        <table className="courier-table" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th>{t.operatorColName}</th>
              <th>{t.operatorColUsername}</th>
              <th style={{ textAlign: 'right' }}>{t.operatorColActions}</th>
            </tr>
          </thead>
          <tbody>
            {operators.map(op => (
              <tr key={op.id}>
                <td><span className="courier-name">{op.firstName} {op.lastName}</span></td>
                <td><span className="courier-username">@{op.username}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="go-action-btn go-action-btn--ghost" onClick={() => openEdit(op)} disabled={busyId === op.id}>
                      {t.operatorActionEdit}
                    </button>
                    <button className="go-action-btn go-action-btn--cancel-admin" onClick={() => handleDelete(op)} disabled={busyId === op.id}>
                      {t.operatorActionDelete}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-bg)', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 600, zIndex: 200, boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      <OperatorModal
        open={modalOpen}
        editing={editing}
        token={token}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSaved={handleSaved}
      />
    </div>
  );
}
