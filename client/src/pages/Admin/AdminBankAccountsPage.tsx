import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import {
  type CompanyBankAccount,
  fetchCompanyBankAccounts,
  addCompanyBankAccount,
  updateCompanyBankAccount,
  setDefaultCompanyBankAccount,
  deleteCompanyBankAccount,
} from '../../api/companyBankAccounts';

interface Props {
  token: string;
}

// ── Modal shell ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, padding: '1.5rem',
        width: 480, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#6b7280' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: '0.9rem' }}>
      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.45rem 0.65rem', borderRadius: 7,
  border: '1px solid #d1d5db', fontSize: '0.88rem',
};

interface AccountFormState {
  label: string;
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
}

const EMPTY_FORM: AccountFormState = { label: '', bankName: '', accountHolderName: '', accountNumber: '' };

// ── Form (shared by Add / Edit) ────────────────────────────────────────────────
function AccountForm({ initial, submitting, error, onSubmit, onCancel, submitLabel }: {
  initial?: AccountFormState;
  submitting: boolean;
  error: string;
  onSubmit: (form: AccountFormState) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<AccountFormState>(initial ?? EMPTY_FORM);
  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  const set = (field: keyof AccountFormState, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div>
      <Field label={t.custBankName} required>
        <input ref={firstRef} style={INPUT} value={form.bankName} onChange={e => set('bankName', e.target.value)} maxLength={100} placeholder={t.custBankNamePh} />
      </Field>
      <Field label={t.custBankHolderName} required>
        <input style={INPUT} value={form.accountHolderName} onChange={e => set('accountHolderName', e.target.value)} maxLength={150} />
      </Field>
      <Field label={t.custBankAccountNumber} required>
        <input style={{ ...INPUT, fontFamily: 'Courier New, monospace' }} value={form.accountNumber} onChange={e => set('accountNumber', e.target.value)} maxLength={50} placeholder={t.custBankAccountNumberPh} />
      </Field>
      <Field label={t.custBankLabel}>
        <input style={INPUT} value={form.label} onChange={e => set('label', e.target.value)} maxLength={60} placeholder={t.custBankLabelPh} />
      </Field>

      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button type="button" onClick={onCancel}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
          {t.cancel}
        </button>
        <button type="button" onClick={() => onSubmit(form)} disabled={submitting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: submitting ? '#d97706' : 'var(--color-accent, #c47f17)', color: '#fff', border: 'none', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {submitting ? t.loading : submitLabel}
        </button>
      </div>
    </div>
  );
}

function validate(form: AccountFormState, t: ReturnType<typeof useLanguage>['t']): string | null {
  if (!form.bankName.trim()) return t.abaErrRequired;
  if (!form.accountHolderName.trim()) return t.abaErrRequired;
  if (!form.accountNumber.trim()) return t.abaErrRequired;
  return null;
}

// ── Add Modal ─────────────────────────────────────────────────────────────────
function AddAccountModal({ token, onClose, onSaved }: {
  token: string; onClose: () => void; onSaved: (accounts: CompanyBankAccount[]) => void;
}) {
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(form: AccountFormState) {
    const validationError = validate(form, t);
    if (validationError) { setError(validationError); return; }
    setSubmitting(true); setError('');
    try {
      const accounts = await addCompanyBankAccount({
        label: form.label.trim() || null,
        bankName: form.bankName.trim(),
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
      }, token);
      onSaved(accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.abaErrSave);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.abaAddModalTitle} onClose={onClose}>
      <AccountForm submitting={submitting} error={error} onSubmit={handleSubmit} onCancel={onClose} submitLabel={t.abaAddBtn} />
    </Modal>
  );
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditAccountModal({ token, account, onClose, onSaved }: {
  token: string; account: CompanyBankAccount; onClose: () => void; onSaved: (accounts: CompanyBankAccount[]) => void;
}) {
  const { t } = useLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const initial: AccountFormState = {
    label: account.label ?? '',
    bankName: account.bankName,
    accountHolderName: account.accountHolderName,
    accountNumber: account.accountNumber,
  };

  async function handleSubmit(form: AccountFormState) {
    const validationError = validate(form, t);
    if (validationError) { setError(validationError); return; }
    setSubmitting(true); setError('');
    try {
      const accounts = await updateCompanyBankAccount(account.id, {
        label: form.label.trim() || null,
        bankName: form.bankName.trim(),
        accountHolderName: form.accountHolderName.trim(),
        accountNumber: form.accountNumber.trim(),
      }, token);
      onSaved(accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.abaErrSave);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={t.abaEditModalTitle} onClose={onClose}>
      <AccountForm initial={initial} submitting={submitting} error={error} onSubmit={handleSubmit} onCancel={onClose} submitLabel={t.save} />
    </Modal>
  );
}

// ── Confirm Delete Modal ────────────────────────────────────────────────────────
function ConfirmDeleteModal({ token, account, onClose, onDeleted }: {
  token: string; account: CompanyBankAccount; onClose: () => void; onDeleted: (accounts: CompanyBankAccount[]) => void;
}) {
  const { t } = useLanguage();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setDeleting(true); setError('');
    try {
      const accounts = await deleteCompanyBankAccount(account.id, token);
      onDeleted(accounts);
    } catch {
      setError(t.abaErrDelete);
      setDeleting(false);
    }
  }

  return (
    <Modal title={t.abaDeleteModalTitle} onClose={onClose}>
      <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#374151' }}>
        {t.abaDeleteMsg(account.label || account.bankName)}
      </p>
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={deleting}
          style={{ padding: '0.4rem 0.9rem', borderRadius: 7, background: '#f3f4f6', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: '0.87rem' }}>
          {t.cancel}
        </button>
        <button onClick={handleConfirm} disabled={deleting}
          style={{ padding: '0.4rem 1rem', borderRadius: 7, background: deleting ? '#fca5a5' : '#dc2626', color: '#fff', border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', fontSize: '0.87rem', fontWeight: 600 }}>
          {deleting ? t.abaDeleting : t.delete}
        </button>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminBankAccountsPage({ token }: Props) {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<CompanyBankAccount | null>(null);
  const [deletingAcc, setDeletingAcc] = useState<CompanyBankAccount | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCompanyBankAccounts(token)
      .then(data => { if (!cancelled) setAccounts(data); })
      .catch(() => { if (!cancelled) setError(t.cbaLoadFail); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, t]);

  async function handleSetDefault(id: string) {
    setBusyId(id);
    try {
      const updated = await setDefaultCompanyBankAccount(id, token);
      setAccounts(updated);
    } catch {
      setError(t.abaErrSave);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ padding: '0 0 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10 }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-subtle)' }}>{t.abaDesc}</p>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.45rem 1rem', borderRadius: 8,
            background: 'var(--color-accent, #c47f17)', color: '#fff',
            border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.875rem',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t.abaAddBtn}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: '0.875rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-subtle)' }}>
          <div className="go-spinner" style={{ margin: '0 auto 0.5rem' }} />
          {t.loading}
        </div>
      ) : accounts.length === 0 ? (
        <div style={{
          padding: '3rem 2rem', textAlign: 'center', border: '2px dashed var(--color-border)',
          borderRadius: 12, color: 'var(--color-text-subtle)',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏦</div>
          <p style={{ margin: 0, fontWeight: 600 }}>{t.abaEmptyTitle}</p>
          <p style={{ margin: '0.25rem 0 1rem', fontSize: '0.85rem' }}>{t.abaEmptyHint}</p>
          <button
            onClick={() => setShowAdd(true)}
            style={{ padding: '0.45rem 1.2rem', borderRadius: 8, background: 'var(--color-accent, #c47f17)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            {t.abaAddBtn}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {accounts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
              padding: '0.85rem 1.1rem', background: 'var(--color-bg-2, #f9fafb)',
              border: '1px solid var(--color-border)', borderRadius: 10,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--color-text)' }}>
                    {a.label || a.bankName}
                  </span>
                  {a.isDefault && (
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 100,
                      fontSize: '0.66rem', fontWeight: 700,
                      background: 'rgba(16,185,129,0.12)', color: '#059669',
                    }}>
                      {t.custBankDefaultBadge}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
                  {a.bankName} · {a.accountHolderName}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)', fontFamily: 'Courier New, monospace' }}>
                  {a.accountNumber}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {!a.isDefault && (
                  <button
                    onClick={() => handleSetDefault(a.id)}
                    disabled={busyId === a.id}
                    style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--color-bg-3, #f3f4f6)', border: '1px solid var(--color-border)', cursor: busyId === a.id ? 'not-allowed' : 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    {t.abaSetDefault}
                  </button>
                )}
                <button
                  onClick={() => setEditing(a)}
                  style={{ padding: '4px 12px', borderRadius: 6, background: 'var(--color-bg-3, #f3f4f6)', border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {t.edit}
                </button>
                <button
                  onClick={() => setDeletingAcc(a)}
                  style={{ padding: '4px 12px', borderRadius: 6, background: '#fee2e2', border: '1px solid #fecaca', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                >
                  {t.delete}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddAccountModal token={token} onClose={() => setShowAdd(false)} onSaved={accounts => { setAccounts(accounts); setShowAdd(false); }} />
      )}
      {editing && (
        <EditAccountModal token={token} account={editing} onClose={() => setEditing(null)} onSaved={accounts => { setAccounts(accounts); setEditing(null); }} />
      )}
      {deletingAcc && (
        <ConfirmDeleteModal token={token} account={deletingAcc} onClose={() => setDeletingAcc(null)} onDeleted={accounts => { setAccounts(accounts); setDeletingAcc(null); }} />
      )}
    </div>
  );
}
