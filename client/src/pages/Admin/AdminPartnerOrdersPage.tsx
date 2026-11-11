import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getAdminPartnerOrders, getPartnerApiKeys } from '../../api/partners';
import { useLanguage } from '../../contexts/useLanguage';
import AdminPartnerOrdersTable from './AdminPartnerOrdersTable';
import './AdminPartnerOrdersPage.css';

interface Props { token: string; }

const PAGE_SIZE = 50;

/**
 * System-admin "Partner Orders" view: every order created through the Partner API
 * (Order.IsPartnerApiOrder), filterable by partner, free text and created-day range.
 * Backend: GET /api/admin/partner-orders (SystemAdmin policy).
 */
export default function AdminPartnerOrdersPage({ token }: Props) {
  const { t } = useLanguage();
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Partner dropdown = every customer that has (or had) an API key.
  const keysQuery = useQuery({
    queryKey: ['admin', 'partners', 'keys'],
    queryFn: () => getPartnerApiKeys(token),
  });
  const partners = useMemo(() => {
    const byId = new Map<string, string>();
    for (const k of keysQuery.data ?? []) byId.set(k.customerId, k.customerBusinessName);
    return [...byId].sort((a, b) => a[1].localeCompare(b[1]));
  }, [keysQuery.data]);

  const filters = { customerId, search: debouncedSearch, from, to, page, pageSize: PAGE_SIZE };
  const ordersQuery = useQuery({
    queryKey: ['admin', 'partnerOrders', filters],
    queryFn: () => getAdminPartnerOrders(token, filters),
    placeholderData: keepPreviousData,
  });

  const hasFilters = !!(customerId || search || from || to);
  function clearFilters() {
    setCustomerId(''); setSearch(''); setDebouncedSearch(''); setFrom(''); setTo(''); setPage(1);
  }

  const data = ordersQuery.data;

  return (
    <div className="apo">
      <p className="apo__desc">{t.apoDesc}</p>

      <div className="apo__filters">
        <select className="apo__input" value={customerId}
          onChange={e => { setCustomerId(e.target.value); setPage(1); }}>
          <option value="">{t.apoAllPartners}</option>
          {partners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <input className="apo__input apo__input--grow" value={search}
          placeholder={t.apoSearchPlaceholder} onChange={e => setSearch(e.target.value)} />
        <label className="apo__date">
          <span>{t.apoFrom}</span>
          <input type="date" className="apo__input" value={from} max={to || undefined}
            onChange={e => { setFrom(e.target.value); setPage(1); }} />
        </label>
        <label className="apo__date">
          <span>{t.apoTo}</span>
          <input type="date" className="apo__input" value={to} min={from || undefined}
            onChange={e => { setTo(e.target.value); setPage(1); }} />
        </label>
        {hasFilters && <button className="apo__btn" onClick={clearFilters}>{t.apoClear}</button>}
      </div>

      {ordersQuery.isError ? (
        <div className="apo__msg apo__msg--error">{t.apoLoadFail}</div>
      ) : ordersQuery.isPending ? (
        <div className="apo__msg"><span className="apo__spinner" /></div>
      ) : !data || data.items.length === 0 ? (
        <div className="apo__msg">{t.apoEmpty}</div>
      ) : (
        <>
          <div className={`apo__meta ${ordersQuery.isFetching ? 'apo__meta--busy' : ''}`}>
            {t.apoTotal(data.totalCount)}
          </div>
          <AdminPartnerOrdersTable orders={data.items} />
          {data.totalPages > 1 && (
            <div className="apo__pager">
              <button className="apo__btn" disabled={!data.hasPreviousPage}
                onClick={() => setPage(p => p - 1)}>{t.apoPrev}</button>
              <span>{t.apoPageOf(data.page, data.totalPages)}</span>
              <button className="apo__btn" disabled={!data.hasNextPage}
                onClick={() => setPage(p => p + 1)}>{t.apoNext}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
