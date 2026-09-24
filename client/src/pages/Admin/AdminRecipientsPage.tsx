import { useEffect, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchRecipients, type RecipientDirectoryItem } from '../../api/recipients';
import { recipientDisplayName } from '../../utils/recipientName';
import { Highlight } from '../../components/ui/Highlight';
import { PhoneActions } from '../../components/ui/PhoneActions';
import { formatGeorgianDateTime } from '../../utils/georgianTime';
import { RecipientOrderHistoryModal } from './RecipientOrderHistoryModal';

const PAGE_SIZE = 20;

// Company-wide recipient directory — Admin/Operator search every past order's recipient by
// name, phone, or address, deduped to one row per phone. Layout mirrors AdminOrderSearchPage
// (inline styles + the .go-orders-table / .tn-badge / .go-spinner classes AdminDashboard's own
// <style> block injects) rather than AdminCustomersPage's card treatment — this page is a
// search-and-drill-down tool, not a primary managed list.
export default function AdminRecipientsPage({ token }: { token: string }) {
  const { t } = useLanguage();
  const [search, setSearch]                   = useState('');
  const [debouncedSearch, setDebouncedSearch]  = useState('');
  const [page, setPage]                        = useState(1);
  const [historyTarget, setHistoryTarget]      = useState<RecipientDirectoryItem | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { setPage(1); }, [debouncedSearch]);

  const query = useQuery({
    queryKey: ['admin', 'recipients', 'list', debouncedSearch, page] as const,
    queryFn: () => fetchRecipients(token, page, PAGE_SIZE, debouncedSearch),
    enabled: !!token,
    placeholderData: keepPreviousData,
  });

  const recipients = query.data?.items ?? [];
  const totalPages = query.data?.totalPages || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>📇 {t.navRecipients}</h2>
        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>{t.rcpSubtitle}</p>
      </div>

      <div style={{ position: 'relative', maxWidth: 480 }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
          <circle cx="6.5" cy="6.5" r="4.5" stroke="var(--color-text-subtle)" strokeWidth="1.4"/>
          <path d="M10 10l3 3" stroke="var(--color-text-subtle)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.rcpSearchPlaceholder}
          autoComplete="off"
          style={{
            width: '100%', padding: '11px 36px', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
            color: 'var(--color-text)', fontSize: '16px', fontFamily: 'var(--font-body)',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {query.isPending && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
          <div className="go-spinner" style={{ margin: '0 auto 8px' }} />{t.loading}
        </div>
      )}
      {query.isError && (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-error)', fontSize: '0.9rem' }}>{t.rcpLoadFail}</div>
      )}
      {query.isSuccess && recipients.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>{t.rcpNoResults}</div>
      )}

      {query.isSuccess && recipients.length > 0 && (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <table className="go-orders-table" style={{ minWidth: 760 }}>
              <thead>
                <tr>
                  <th>{t.rcpThName}</th>
                  <th>{t.rcpThLocation}</th>
                  <th>{t.rcpThOrders}</th>
                  <th>{t.rcpThLastOrder}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.recipientPhone}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                        <Highlight text={recipientDisplayName(r.recipientName, t.recipientUnknown)} term={debouncedSearch} />
                      </div>
                      <PhoneActions phone={r.recipientPhone} highlightTerm={debouncedSearch} />
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                        <Highlight text={`${r.recipientCity}, ${r.recipientDistrict}`} term={debouncedSearch} />
                      </div>
                      {r.recipientAddress && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                          <Highlight text={r.recipientAddress} term={debouncedSearch} />
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.82rem', fontWeight: 600 }}>{r.orderCount}</td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>
                      {formatGeorgianDateTime(r.lastOrderAt) || '—'}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="go-action-btn go-action-btn--assign"
                        onClick={() => setHistoryTarget(r)}
                      >
                        {t.rcpViewHistory}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-border)', cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.5 : 1 }}
              >{t.acupPrev}</button>
              <span style={{ fontSize: '0.85rem' }}>{t.acupPage(page, totalPages)}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, border: '1px solid var(--color-border)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', opacity: page >= totalPages ? 0.5 : 1 }}
              >{t.acupNext}</button>
            </div>
          )}
        </>
      )}

      <RecipientOrderHistoryModal
        token={token}
        phone={historyTarget?.recipientPhone ?? null}
        displayName={historyTarget ? recipientDisplayName(historyTarget.recipientName, t.recipientUnknown) : ''}
        onClose={() => setHistoryTarget(null)}
      />
    </div>
  );
}
