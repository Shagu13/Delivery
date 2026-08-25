import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { getCustomerBankAccounts } from '../../api/customers';
import type { CustomerBankAccount } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';
import '../../components/ui/Modal.css';

interface Props {
  customer: { id: string; businessName: string } | null;
  onClose: () => void;
}

/**
 * Admin read-only lookup of a customer's saved bank accounts, for payout verification.
 * The customer manages these themselves from their own profile — admins cannot edit here.
 */
export function CustomerBankAccountsModal({ customer, onClose }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();

  const [rows,    setRows]    = useState<CustomerBankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!customer || !token) return;
    setLoading(true);
    setError(null);
    getCustomerBankAccounts(customer.id, token)
      .then(setRows)
      .catch(() => setError(t.cbaLoadFail))
      .finally(() => setLoading(false));
  }, [customer, token, t.cbaLoadFail]);

  if (!customer) return null;

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.cbaTitle(customer.businessName)}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          {loading ? (
            <p>{t.loading}</p>
          ) : error ? (
            <div className="ui-modal__error" role="alert">{error}</div>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--color-text-subtle)', fontSize: '0.86rem' }}>{t.cbaEmpty}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map(a => (
                <div
                  key={a.id}
                  style={{
                    padding: '10px 12px', background: 'var(--color-bg-3)', borderRadius: 8,
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--color-text)' }}>
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
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                    {a.bankName} · {a.accountHolderName}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>
                    {a.accountNumber}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose}>{t.close}</button>
        </div>
      </div>
    </div>
  );
}
