import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAccounts, type AdminAccount } from '../../api/adminAccounts';
import { AdminAccountPasswordModal } from './AdminAccountPasswordModal';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  token: string;
}

/** System admin only: lists the other Admin accounts and lets the system admin reset their password. */
export default function AdminAccountsPage({ token }: Props) {
  const { t } = useLanguage();
  const [resetting, setResetting] = useState<AdminAccount | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  const { data: accounts = [], isLoading, isError } = useQuery({
    queryKey: ['admin', 'adminAccounts'],
    queryFn: () => fetchAdminAccounts(token),
  });

  const handleDone = (account: AdminAccount) => {
    setResetting(null);
    setToast(t.aaaResetSuccess(`${account.firstName} ${account.lastName}`));
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="content-card" style={{ overflow: 'hidden' }}>
      <div className="content-card__header">
        <span className="content-card__title">{t.topbarAdminAccounts}</span>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', margin: '0 20px 12px', lineHeight: 1.5 }}>
        {t.aaaDesc}
      </p>

      {isLoading ? (
        <div className="go-loading"><div className="go-spinner" /></div>
      ) : isError ? (
        <div className="go-error">{t.aaaLoadFail}</div>
      ) : accounts.length === 0 ? (
        <div className="empty-state" style={{ padding: '48px 20px' }}>
          <span className="empty-state__text">{t.aaaEmpty}</span>
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
              {accounts.map(a => (
                <tr key={a.id}>
                  <td><span className="courier-name">{a.firstName} {a.lastName}</span></td>
                  <td><span className="courier-username">@{a.username}</span></td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button className="go-action-btn go-action-btn--ghost" onClick={() => setResetting(a)}>
                        {t.aaaResetPassword}
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
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-bg)', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', fontWeight: 600, zIndex: 1100, boxShadow: '0 6px 24px rgba(0,0,0,0.2)' }}>
          {toast}
        </div>
      )}

      <AdminAccountPasswordModal account={resetting} onClose={() => setResetting(null)} onDone={handleDone} />
    </div>
  );
}
