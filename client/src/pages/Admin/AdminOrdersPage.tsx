import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { setCourierSalary, setCompanyServicePrice } from '../../api/orders';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { EditOrderModal } from './EditOrderModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminOrderItem {
  id: string;
  trackingNumber: string;
  senderBusinessName: string;
  senderFirstName: string;
  senderLastName: string;
  senderPhone: string;
  recipientFirstName: string;
  recipientLastName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientCityGeo?: string;
  recipientDistrict: string;
  recipientDistrictGeo?: string;
  recipientAddress: string;
  description: string | null;
  isFragile: boolean;
  status: string;
  productPaymentStatus: string;
  whoPaysForCompanyService: string;
  amountToCollectForPackage: number | null;
  companyServicePrice: number;
  courierSalary: number | null;
  companyRevenue: number | null;
  createdAt: string;
  deliveredAt: string | null;
}

interface PagedResult {
  items: AdminOrderItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── API ───────────────────────────────────────────────────────────────────────

async function fetchAllOrders(
  token: string,
  params: {
    city?: string; district?: string; search?: string;
    courierId?: string; unpriced?: boolean;
    page?: number; pageSize?: number;
  }
): Promise<PagedResult> {
  const qs = new URLSearchParams();
  if (params.city)       qs.set('city',      params.city);
  if (params.district)   qs.set('district',  params.district);
  if (params.search)     qs.set('search',    params.search);
  if (params.courierId)  qs.set('courierId', params.courierId);
  if (params.unpriced)   qs.set('unpriced',  'true');
  if (params.page)       qs.set('page',      String(params.page));
  if (params.pageSize)   qs.set('pageSize',  String(params.pageSize));
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch orders');
  return res.json();
}

async function fetchUnpricedCount(token: string, courierId?: string): Promise<number> {
  const qs = new URLSearchParams({ unpriced: 'true', pageSize: '1', page: '1' });
  if (courierId) qs.set('courierId', courierId);
  const res = await fetch(`/api/orders?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data: PagedResult = await res.json();
  return data.totalCount;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

/** Truncate text at maxLen, showing title on hover */
function Trunc({ text, max = 14, className }: { text: string; max?: number; className?: string }) {
  if (!text) return <span style={{ opacity: 0.35 }}>—</span>;
  if (text.length <= max) return <span className={className}>{text}</span>;
  return (
    <span className={className} title={text} style={{ cursor: 'default' }}>
      {text.slice(0, max)}…
    </span>
  );
}

/** Tracking number cell: shows 8 chars, hover reveals full + copy button */
function TrackingCell({ tn }: { tn: string }) {
  const [hovered, setHovered] = useState(false);
  const [copied,  setCopied]  = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(tn).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <span
      className="tn-cell"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="tn-badge tn-badge--compact" title={tn}>
        {hovered ? tn : tn.slice(0, 8)}
      </span>
      {hovered && (
        <button className="tn-copy" onClick={copy} title="Copy tracking number">
          {copied
            ? <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 4" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="5" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M3 4H2a1 1 0 00-1 1v10a1 1 0 001 1h9a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
          }
        </button>
      )}
    </span>
  );
}

// ── Courier picker dropdown ───────────────────────────────────────────────────

interface CourierPickerProps {
  couriers: Courier[];
  selected: Courier | null;
  onSelect: (c: Courier | null) => void;
}

function CourierPicker({ couriers, selected, onSelect }: CourierPickerProps) {
  const { t } = useLanguage();
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return couriers;
    const q = query.toLowerCase();
    return couriers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.assignedCity.toLowerCase().includes(q) ||
      c.assignedDistrict.toLowerCase().includes(q)
    );
  }, [couriers, query]);

  const handleSelect = (c: Courier | null) => {
    onSelect(c);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="cp-root" ref={ref}>
      <button
        className={`cp-trigger${selected ? ' cp-trigger--active' : ''}`}
        onClick={() => setOpen(v => !v)}
        type="button"
      >
        {selected ? (
          <>
            <span className="cp-avatar">{initials(selected.fullName)}</span>
            <span className="cp-trigger-name">{selected.fullName}</span>
            <span className="cp-trigger-city">{selected.assignedCity}</span>
            <span
              className="cp-clear"
              role="button"
              tabIndex={0}
              title={t.aopClearCourierTitle}
              onClick={e => { e.stopPropagation(); handleSelect(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); handleSelect(null); }}}
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="5.5" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M2 14c0-3 2.5-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span>{t.aopAllCouriers}</span>
            <svg className="cp-chevron" width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          </>
        )}
      </button>

      {open && (
        <div className="cp-dropdown">
          <div className="cp-search-wrap">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M10.5 10.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              autoFocus
              className="cp-search"
              placeholder={t.aopSearchCouriers}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button className="cp-search-clear" onClick={() => setQuery('')}>
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          <div className="cp-list">
            <button className={`cp-item${!selected ? ' cp-item--active' : ''}`} onClick={() => handleSelect(null)}>
              <span className="cp-item-all-icon">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="5.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <circle cx="11" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
                  <path d="M1 14c0-2.5 2-4 4.5-4M8 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </span>
              <span className="cp-item-name">{t.aopAllCouriers}</span>
            </button>

            {filtered.length === 0 && <div className="cp-empty">{t.aopNoCourierMatch(query)}</div>}

            {filtered.map(c => (
              <button
                key={c.courierId}
                className={`cp-item${selected?.courierId === c.courierId ? ' cp-item--active' : ''}`}
                onClick={() => handleSelect(c)}
              >
                <span className="cp-item-avatar">{initials(c.fullName)}</span>
                <span className="cp-item-info">
                  <span className="cp-item-name">{c.fullName}</span>
                  <span className="cp-item-meta">{c.assignedCity}, {c.assignedDistrict}</span>
                </span>
                {selected?.courierId === c.courierId && (
                  <svg className="cp-item-check" width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AdminOrdersPage({ token: tokenProp }: { token: string }) {
  const { token: authToken } = useAuth();
  const { t, lang } = useLanguage();
  const token = tokenProp || authToken || '';

  const [data,            setData]            = useState<PagedResult | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [search,          setSearch]          = useState('');
  const [filterCity,      setFilterCity]      = useState('');
  const [filterDistrict,  setFilterDistrict]  = useState('');
  const [filterCourier,   setFilterCourier]   = useState<Courier | null>(null);
  const [filterUnpriced,  setFilterUnpriced]  = useState(false);
  const [unpricedCount,   setUnpricedCount]   = useState<number | null>(null);
  const [couriers,        setCouriers]        = useState<Courier[]>([]);
  const [page,            setPage]            = useState(1);
  const [selected,        setSelected]        = useState<Set<string>>(new Set());

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPrice,     setBulkPrice]     = useState('');
  const [bulkSalary,    setBulkSalary]    = useState('');
  const [bulkBusy,      setBulkBusy]      = useState(false);
  const [toast,         setToast]         = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);

  // Edit modal
  const [editOrder,     setEditOrder]     = useState<AdminOrderItem | null>(null);
  const [editOpen,      setEditOpen]      = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef   = useRef({ city: '', district: '', search: '', courierId: '', unpriced: false });

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    fetchCouriers(token).then(setCouriers).catch(() => {});
  }, [token]);

  const refreshUnpricedCount = useCallback(async () => {
    const count = await fetchUnpricedCount(token, filterCourier?.courierId);
    setUnpricedCount(count);
  }, [token, filterCourier]);

  useEffect(() => { void refreshUnpricedCount(); }, [refreshUnpricedCount]);

  const load = useCallback(async (params: {
    city?: string; district?: string; search?: string;
    courierId?: string; unpriced?: boolean; page?: number;
  }) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAllOrders(token, { ...params, pageSize: PAGE_SIZE });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.aopFailedLoad);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    const prev = filterRef.current;
    const next = {
      city:      filterCity,
      district:  filterDistrict,
      search,
      courierId: filterCourier?.courierId ?? '',
      unpriced:  filterUnpriced,
    };

    const filterChanged =
      prev.city      !== next.city      ||
      prev.district  !== next.district  ||
      prev.search    !== next.search    ||
      prev.courierId !== next.courierId ||
      prev.unpriced  !== next.unpriced;

    filterRef.current = next;

    const delay = filterChanged && next.search !== prev.search ? 300 : 0;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const targetPage = filterChanged ? 1 : page;
      if (filterChanged && page !== 1) setPage(1);
      if (filterChanged)               setSelected(new Set());

      void load({
        city:      filterCity     || undefined,
        district:  filterDistrict || undefined,
        search:    search         || undefined,
        courierId: filterCourier?.courierId,
        unpriced:  filterUnpriced || undefined,
        page:      targetPage,
      });
    }, delay);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCity, filterDistrict, search, filterCourier, filterUnpriced, page, load]);

  const cities = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.items.map(o => o.recipientCity))].sort();
  }, [data]);

  const districts = useMemo(() => {
    if (!data || !filterCity) return [];
    return [...new Set(
      data.items.filter(o => o.recipientCity === filterCity).map(o => o.recipientDistrict)
    )].sort();
  }, [data, filterCity]);

  const orders = data?.items ?? [];

  const allSelected  = orders.length > 0 && orders.every(o => selected.has(o.id));
  const someSelected = selected.size > 0;
  const toggleAll    = () => setSelected(allSelected ? new Set() : new Set(orders.map(o => o.id)));
  const toggleOne    = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleBulkApply = async () => {
    const price  = bulkPrice  ? parseFloat(bulkPrice)  : null;
    const salary = bulkSalary ? parseFloat(bulkSalary) : null;
    if ((price  !== null && (isNaN(price)  || price  < 0)) ||
        (salary !== null && (isNaN(salary) || salary < 0))) return;
    if (price === null && salary === null) return;
    if (selected.size === 0) return;

    setBulkBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.flatMap(id => [
        ...(price  !== null ? [setCompanyServicePrice(token, id, price)]  : []),
        ...(salary !== null ? [setCourierSalary(token, id, salary)]       : []),
      ]));
      const parts = [
        price  !== null ? `service price ₾${price.toFixed(2)}`  : '',
        salary !== null ? `salary ₾${salary.toFixed(2)}`        : '',
      ].filter(Boolean).join(' + ');
      showToast(`Set ${parts} on ${ids.length} order${ids.length !== 1 ? 's' : ''}.`);
      setShowBulkModal(false);
      setBulkPrice('');
      setBulkSalary('');
      setSelected(new Set());
      await Promise.all([
        load({ city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, page }),
        refreshUnpricedCount(),
      ]);
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setBulkBusy(false);
    }
  };

  const cancelBulk = () => { setShowBulkModal(false); setBulkPrice(''); setBulkSalary(''); };

  const hasActiveFilters = filterCity || filterDistrict || search || filterCourier || filterUnpriced;
  const clearAll = () => {
    setFilterCity(''); setFilterDistrict(''); setSearch('');
    setFilterCourier(null); setFilterUnpriced(false);
  };

  const handleEditClick = (e: React.MouseEvent, order: AdminOrderItem) => {
    e.stopPropagation();
    setEditOrder(order);
    setEditOpen(true);
  };

  const handleEditSaved = () => {
    showToast(t.aopOrderUpdated);
    void load({ city: filterCity || undefined, district: filterDistrict || undefined, search: search || undefined, courierId: filterCourier?.courierId, unpriced: filterUnpriced || undefined, page });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="aop-root">

      {/* Toolbar */}
      <div className="aop-toolbar">
        <div className="go-search">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10.5 10.5l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder={t.aopSearchPh}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="go-search-clear" onClick={() => setSearch('')}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

        <CourierPicker couriers={couriers} selected={filterCourier} onSelect={setFilterCourier} />

        <div className="go-select-wrap">
          <svg className="go-select-icon" width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="7" r="4" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 11c0 0 5 3.5 5 5H3c0-1.5 5-5 5-5z" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          <select className="go-select" value={filterCity}
            onChange={e => { setFilterCity(e.target.value); setFilterDistrict(''); }}>
            <option value="">{t.aopAllCities}</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <svg className="go-select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <div className="go-select-wrap">
          <select className="go-select" value={filterDistrict} disabled={!filterCity}
            onChange={e => setFilterDistrict(e.target.value)}>
            <option value="">{t.aopAllDistricts}</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <svg className="go-select-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        <button
          className={`aop-unpriced-btn${filterUnpriced ? ' aop-unpriced-btn--active' : ''}`}
          onClick={() => setFilterUnpriced(v => !v)}
          title={t.aopUnpricedTitle}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {t.aopUnpriced}
          {unpricedCount !== null && unpricedCount > 0 && (
            <span className={`aop-unpriced-badge${filterUnpriced ? ' aop-unpriced-badge--active' : ''}`}>
              {unpricedCount}
            </span>
          )}
        </button>

        {hasActiveFilters && (
          <button className="go-clear-btn" onClick={clearAll}>{t.aopClearFilters}</button>
        )}

        <span className="go-count" style={{ marginLeft: 'auto' }}>
          {data ? t.aopOrderCount(data.totalCount) : ''}
        </span>
      </div>

      {/* Active courier banner */}
      {filterCourier && (
        <div className="aop-courier-banner">
          <span className="aop-courier-banner__avatar">{initials(filterCourier.fullName)}</span>
          <div className="aop-courier-banner__info">
            <span className="aop-courier-banner__name">{filterCourier.fullName}</span>
            <span className="aop-courier-banner__meta">
              {filterCourier.assignedCity}, {filterCourier.assignedDistrict} · {filterCourier.phoneNumber}
            </span>
          </div>
          {filterUnpriced && unpricedCount !== null && (
            <span className="aop-courier-banner__unpriced">
              {t.aopMissingFinancials(unpricedCount)}
            </span>
          )}
          <button className="aop-courier-banner__clear" onClick={() => setFilterCourier(null)} title={t.aopClearCourierTitle}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {someSelected && (
        <div className="aop-bulk-bar">
          <span className="aop-bulk-count">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M5 8l2.5 2.5L11 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.aopNSelected(selected.size)}
          </span>

          {!showBulkModal && (
            <>
              <button className="aop-bulk-btn aop-bulk-btn--price" onClick={() => setShowBulkModal(true)}>
                {t.aopSetPrices}
              </button>
              <button className="aop-bulk-btn aop-bulk-btn--ghost" onClick={() => setSelected(new Set())}>
                {t.aopDeselectAll}
              </button>
            </>
          )}

          {showBulkModal && (
            <div className="aop-bulk-input-row">
              <span className="aop-bulk-label">{t.aopBulkSvcLabel}</span>
              <div className="aop-bulk-input-wrap">
                <span className="aop-bulk-currency">₾</span>
                <input
                  className="aop-bulk-input"
                  type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh}
                  value={bulkPrice} autoFocus
                  onChange={e => setBulkPrice(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') cancelBulk(); }}
                />
              </div>
              <span className="aop-bulk-label" style={{ marginLeft: 8 }}>{t.aopBulkSalLabel}</span>
              <div className="aop-bulk-input-wrap">
                <span className="aop-bulk-currency">₾</span>
                <input
                  className="aop-bulk-input"
                  type="number" min="0" step="0.01" placeholder={t.aopUnchangedPh}
                  value={bulkSalary}
                  onChange={e => setBulkSalary(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void handleBulkApply(); if (e.key === 'Escape') cancelBulk(); }}
                />
              </div>
              <button className="aop-bulk-btn aop-bulk-btn--apply"
                disabled={bulkBusy || (!bulkPrice && !bulkSalary)} onClick={handleBulkApply}>
                {bulkBusy ? t.aopSaving : t.aopApply}
              </button>
              <button className="aop-bulk-btn aop-bulk-btn--ghost" disabled={bulkBusy} onClick={cancelBulk}>
                {t.cancel}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="aop-table-wrap">
        {loading && <div className="go-loading"><div className="go-spinner"/>{t.aopLoadingOrders}</div>}
        {!loading && error && <div className="go-error">{error}</div>}
        {!loading && !error && orders.length === 0 && (
          <div className="go-loading" style={{ color: 'var(--color-text-subtle)' }}>
            {filterUnpriced ? t.aopAllPriced : t.aopNoOrdersMatch}
          </div>
        )}

        {!loading && !error && orders.length > 0 && (
          <table className="aop-table">
            <thead>
              <tr>
                <th className="aop-th aop-th--check">
                  <input type="checkbox" className="aop-checkbox" checked={allSelected}
                    ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAll}
                    title={allSelected ? t.aopDeselectAll : t.aopSelectAll}
                  />
                </th>
                <th className="aop-th">{t.aopThTracking}</th>
                <th className="aop-th">{t.aopThSender}</th>
                <th className="aop-th">{t.aopThRecipient}</th>
                <th className="aop-th">{t.aopThPhone}</th>
                <th className="aop-th">{t.aopThCityDistrict}</th>
                <th className="aop-th">{t.aopThStatus}</th>
                <th className="aop-th aop-th--num" title={t.aopThPayerTitle}>{t.aopThPayer}</th>
                <th className="aop-th aop-th--num">{t.aopThCod}</th>
                <th className="aop-th aop-th--num">{t.aopThSvcPrice}</th>
                <th className="aop-th aop-th--num">{t.aopThSalary}</th>
                <th className="aop-th aop-th--num">{t.aopThRevenue}</th>
                <th className="aop-th">{t.aopThPaid}</th>
                <th className="aop-th aop-th--edit" />
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const isChecked     = selected.has(order.id);
                const [bg, color]   = STATUS_COLORS[order.status] ?? ['rgba(160,120,0,0.12)', '#c4870f'];
                const statusMeta    = getStatusMeta(order.status, lang);
                const missingPrice  = order.companyServicePrice === 0;
                const missingSalary = order.courierSalary == null || order.courierSalary === 0;
                const rcptPays      = order.whoPaysForCompanyService === 'Recipient';
                return (
                  <tr key={order.id}
                    className={`aop-tr${isChecked ? ' aop-tr--selected' : ''}`}
                    onClick={() => toggleOne(order.id)}
                  >
                    <td className="aop-td aop-td--check" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" className="aop-checkbox" checked={isChecked}
                        onChange={() => toggleOne(order.id)}/>
                    </td>
                    <td className="aop-td aop-td--tracking">
                      <TrackingCell tn={order.trackingNumber} />
                    </td>
                    <td className="aop-td aop-td--sender">
                      <Trunc text={order.senderBusinessName} max={13} className="aop-sender-biz" />
                      <div className="aop-sender-name">
                        <Trunc text={`${order.senderFirstName} ${order.senderLastName}`} max={12} />
                      </div>
                    </td>
                    <td className="aop-td">
                      <Trunc text={`${order.recipientFirstName} ${order.recipientLastName}`} max={13} className="aop-name" />
                      <div className="aop-addr" title={order.recipientAddress}>
                        <Trunc text={order.recipientAddress} max={16} />
                      </div>
                    </td>
                    <td className="aop-td aop-td--mono">{order.recipientPhone}</td>
                    <td className="aop-td">
                      <div className="aop-city">{lang === 'ka' && order.recipientCityGeo ? order.recipientCityGeo : order.recipientCity}</div>
                      <div className="aop-district">{lang === 'ka' && order.recipientDistrictGeo ? order.recipientDistrictGeo : order.recipientDistrict}</div>
                    </td>
                    <td className="aop-td">
                      <span className="status-badge" style={{ background: bg, color }} title={statusMeta.description}>
                        {statusMeta.short}
                      </span>
                    </td>
                    <td className="aop-td aop-td--num">
                      <span className={`aop-payer-badge${rcptPays ? ' aop-payer-badge--rcpt' : ''}`} title={rcptPays ? t.aopPayerRcptTitle : t.aopPayerSndrTitle}>
                        {rcptPays ? t.aopRcpt : t.aopSndr}
                      </span>
                    </td>
                    <td className="aop-td aop-td--num">
                      {order.amountToCollectForPackage != null
                        ? <span className="aop-price aop-price--cod">₾{order.amountToCollectForPackage.toFixed(2)}</span>
                        : <span className="aop-price aop-price--empty">—</span>
                      }
                    </td>
                    <td className="aop-td aop-td--num">
                      {missingPrice
                        ? <span className="aop-missing">{t.aopNotSet}</span>
                        : <span className="aop-price">₾{order.companyServicePrice.toFixed(2)}</span>
                      }
                    </td>
                    <td className="aop-td aop-td--num">
                      {missingSalary
                        ? <span className="aop-missing">{t.aopNotSet}</span>
                        : <span className="aop-price">₾{order.courierSalary!.toFixed(2)}</span>
                      }
                    </td>
                    <td className="aop-td aop-td--num">
                      {order.companyRevenue != null
                        ? <span className="aop-price">₾{order.companyRevenue.toFixed(2)}</span>
                        : <span className="aop-price aop-price--empty">—</span>
                      }
                    </td>
                    <td className="aop-td">
                      {order.productPaymentStatus === 'Paid'
                        ? <span className="aop-paid">{t.aopPaid}</span>
                        : <span className="aop-unpaid">{t.aopUnpaid}</span>
                      }
                    </td>
                    <td className="aop-td aop-td--edit" onClick={e => e.stopPropagation()}>
                      <button
                        className="aop-edit-btn"
                        onClick={e => handleEditClick(e, order)}
                        title={t.aopEditOrderTitle}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                          <path d="M11.5 2.5a1.5 1.5 0 012.12 2.12l-8 8L3 13.5l.88-2.62 8-8z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="aop-pagination">
          <button className="aop-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            {t.aopPrevPage}
          </button>
          <span className="aop-page-info">{t.aopPageInfo(data.page, data.totalPages)}</span>
          <button className="aop-page-btn" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
            {t.aopNextPage}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`action-toast${toast.type === 'err' ? ' action-toast--err' : ''}`}>
          {toast.type === 'ok'
            ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          }
          {toast.msg}
        </div>
      )}

      {/* Edit Order Modal */}
      <EditOrderModal
        order={editOrder}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={handleEditSaved}
        token={token}
      />

      <style>{`
        .aop-root { display: flex; flex-direction: column; min-height: 0; }
        .aop-toolbar { display: flex; align-items: center; gap: 10px; padding: 12px 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; background: var(--color-bg); }

        /* Courier picker */
        .cp-root { position: relative; }
        .cp-trigger { display: flex; align-items: center; gap: 7px; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 500; padding: 7px 12px; cursor: pointer; transition: all var(--transition); white-space: nowrap; max-width: 240px; }
        .cp-trigger:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .cp-trigger--active { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.4); color: #3b82f6; }
        .cp-avatar { width: 22px; height: 22px; border-radius: 50%; background: #3b82f6; color: #fff; font-size: 0.62rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cp-trigger-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; max-width: 110px; }
        .cp-trigger-city { font-size: 0.74rem; opacity: 0.75; }
        .cp-chevron { margin-left: auto; flex-shrink: 0; }
        .cp-clear { margin-left: 2px; display: flex; align-items: center; padding: 2px; border-radius: 3px; flex-shrink: 0; cursor: pointer; opacity: 0.6; }
        .cp-clear:hover { opacity: 1; }
        .cp-dropdown { position: absolute; top: calc(100% + 6px); left: 0; z-index: 100; width: 280px; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: 0 8px 32px rgba(0,0,0,0.18); animation: expand-in 0.12s ease both; }
        .cp-search-wrap { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--color-border); color: var(--color-text-subtle); }
        .cp-search { flex: 1; background: none; border: none; outline: none; color: var(--color-text); font-size: 0.82rem; }
        .cp-search::placeholder { color: var(--color-text-subtle); }
        .cp-search-clear { background: none; border: none; cursor: pointer; color: var(--color-text-subtle); padding: 0; display: flex; }
        .cp-search-clear:hover { color: var(--color-text); }
        .cp-list { max-height: 260px; overflow-y: auto; padding: 4px; }
        .cp-item { display: flex; align-items: center; gap: 10px; width: 100%; background: none; border: none; border-radius: var(--radius-sm); padding: 8px 10px; cursor: pointer; text-align: left; transition: background var(--transition); }
        .cp-item:hover { background: var(--color-bg-3); }
        .cp-item--active { background: rgba(59,130,246,0.08); }
        .cp-item-all-icon { width: 28px; height: 28px; border-radius: 50%; background: var(--color-bg-3); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; color: var(--color-text-subtle); flex-shrink: 0; }
        .cp-item-avatar { width: 28px; height: 28px; border-radius: 50%; background: #3b82f6; color: #fff; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cp-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
        .cp-item-name { font-size: 0.82rem; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .cp-item-meta { font-size: 0.72rem; color: var(--color-text-subtle); }
        .cp-item-check { margin-left: auto; color: #3b82f6; flex-shrink: 0; }
        .cp-empty { font-size: 0.78rem; color: var(--color-text-subtle); text-align: center; padding: 16px 10px; }

        /* Courier banner */
        .aop-courier-banner { display: flex; align-items: center; gap: 12px; padding: 10px 20px; background: rgba(59,130,246,0.06); border-bottom: 1px solid rgba(59,130,246,0.2); animation: expand-in 0.15s ease both; }
        .aop-courier-banner__avatar { width: 32px; height: 32px; border-radius: 50%; background: #3b82f6; color: #fff; font-size: 0.7rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .aop-courier-banner__info { display: flex; flex-direction: column; gap: 1px; }
        .aop-courier-banner__name { font-size: 0.875rem; font-weight: 700; color: var(--color-text); }
        .aop-courier-banner__meta { font-size: 0.75rem; color: var(--color-text-subtle); }
        .aop-courier-banner__unpriced { margin-left: 8px; font-size: 0.75rem; font-weight: 600; background: rgba(239,68,68,0.1); color: #ef4444; border-radius: 100px; padding: 3px 10px; }
        .aop-courier-banner__clear { margin-left: auto; background: none; border: none; cursor: pointer; color: var(--color-text-subtle); padding: 4px; border-radius: var(--radius-sm); display: flex; align-items: center; transition: color var(--transition); }
        .aop-courier-banner__clear:hover { color: var(--color-text); }

        /* Unpriced toggle */
        .aop-unpriced-btn { display: flex; align-items: center; gap: 7px; background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 600; padding: 7px 13px; cursor: pointer; transition: all var(--transition); white-space: nowrap; }
        .aop-unpriced-btn:hover:not(.aop-unpriced-btn--active) { color: var(--color-text); border-color: var(--color-text-subtle); }
        .aop-unpriced-btn--active { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
        .aop-unpriced-badge { display: inline-flex; align-items: center; justify-content: center; min-width: 20px; height: 18px; padding: 0 5px; background: #ef4444; color: #fff; border-radius: 100px; font-size: 0.68rem; font-weight: 700; }
        .aop-unpriced-badge--active { background: #fff; color: #ef4444; }

        /* Bulk bar */
        .aop-bulk-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 20px; background: var(--color-accent-dim); border-bottom: 1px solid rgba(196,127,23,0.25); animation: expand-in 0.15s ease both; }
        .aop-bulk-count { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 700; color: var(--color-accent); }
        .aop-bulk-btn { border: none; border-radius: var(--radius-sm); font-size: 0.78rem; font-weight: 600; padding: 7px 14px; cursor: pointer; transition: opacity 0.15s; white-space: nowrap; }
        .aop-bulk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .aop-bulk-btn--price  { background: #8b5cf6; color: #fff; }
        .aop-bulk-btn--salary { background: #10b981; color: #fff; }
        .aop-bulk-btn--apply  { background: var(--color-accent); color: #fff; }
        .aop-bulk-btn--ghost  { background: var(--color-bg-3); border: 1px solid var(--color-border); color: var(--color-text); }
        .aop-bulk-input-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .aop-bulk-label { font-size: 0.82rem; font-weight: 600; color: var(--color-text); white-space: nowrap; }
        .aop-bulk-input-wrap { position: relative; display: flex; align-items: center; }
        .aop-bulk-currency { position: absolute; left: 10px; font-size: 0.85rem; color: var(--color-text-subtle); pointer-events: none; }
        .aop-bulk-input { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.875rem; padding: 7px 10px 7px 26px; width: 130px; outline: none; transition: border-color var(--transition); }
        .aop-bulk-input:focus { border-color: var(--color-accent); }

        /* Table */
        .aop-table-wrap { overflow-x: auto; flex: 1; }
        .aop-table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1100px; }
        .aop-th { text-align: left; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-text-subtle); padding: 9px 10px; border-bottom: 1px solid var(--color-border); background: var(--color-bg-3); white-space: nowrap; position: sticky; top: 0; z-index: 1; overflow: hidden; text-overflow: ellipsis; }
        .aop-th--check { width: 40px; padding-left: 16px; }
        .aop-th--num { text-align: right; }
        .aop-th--edit { width: 36px; }
        .aop-td { padding: 9px 10px; font-size: 0.8rem; color: var(--color-text); border-bottom: 1px solid var(--color-border); vertical-align: middle; cursor: pointer; overflow: hidden; }
        .aop-td--check { padding-left: 16px; cursor: default; width: 40px; }
        .aop-td--tracking { width: 100px; }
        .aop-td--sender { width: 120px; }
        .aop-td--mono { font-family: 'Courier New', monospace; font-size: 0.76rem; width: 100px; }
        .aop-td--num { text-align: right; width: 68px; }
        .aop-td--edit { width: 36px; cursor: default; text-align: center; }
        .aop-tr { transition: background var(--transition); }
        .aop-tr:hover { background: var(--color-bg-3); }
        .aop-tr--selected { background: rgba(196,127,23,0.07) !important; }
        .aop-tr:last-child .aop-td { border-bottom: none; }

        /* Cell content */
        .aop-sender-biz { font-weight: 600; font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%; }
        .aop-sender-name { font-size: 0.72rem; color: var(--color-text-subtle); margin-top: 1px; }
        .aop-name { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
        .aop-addr { font-size: 0.72rem; color: var(--color-text-subtle); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .aop-city { font-weight: 500; font-size: 0.8rem; }
        .aop-district { font-size: 0.72rem; color: var(--color-text-subtle); margin-top: 1px; }
        .aop-price { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 0.8rem; }
        .aop-price--empty { color: var(--color-text-subtle); font-weight: 400; }
        .aop-price--cod { color: #3b82f6; }
        .aop-missing { font-size: 0.7rem; font-weight: 600; color: #ef4444; background: rgba(239,68,68,0.1); border-radius: 4px; padding: 2px 5px; }
        .aop-paid   { color: #10b981; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
        .aop-unpaid { color: #ef4444; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
        .aop-checkbox { width: 14px; height: 14px; cursor: pointer; accent-color: var(--color-accent); }
        .aop-payer-badge { display: inline-block; font-size: 0.62rem; font-weight: 700; border-radius: 3px; padding: 1px 5px; background: rgba(59,130,246,0.1); color: #3b82f6; white-space: nowrap; }
        .aop-payer-badge--rcpt { background: rgba(196,127,23,0.12); color: var(--color-accent); }
        .aop-edit-btn { background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 6px; cursor: pointer; color: var(--color-text-subtle); display: flex; align-items: center; transition: all var(--transition); }
        .aop-edit-btn:hover { background: var(--color-bg-3); color: var(--color-accent); border-color: rgba(196,127,23,0.4); }

        /* Tracking cell */
        .tn-cell { position: relative; display: inline-flex; align-items: center; gap: 5px; }
        .tn-badge--compact { font-family: 'Courier New', monospace; font-size: 0.72rem; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 2px 6px; color: var(--color-text-muted); white-space: nowrap; transition: all 0.1s; }
        .tn-copy { background: none; border: 1px solid var(--color-border); border-radius: 3px; cursor: pointer; color: var(--color-text-subtle); padding: 2px 4px; display: flex; align-items: center; animation: expand-in 0.1s ease both; }
        .tn-copy:hover { color: var(--color-accent); border-color: var(--color-accent); }

        /* Pagination */
        .aop-pagination { display: flex; align-items: center; gap: 14px; justify-content: center; padding: 16px 20px; border-top: 1px solid var(--color-border); }
        .aop-page-btn { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 0.82rem; font-weight: 600; padding: 7px 16px; cursor: pointer; transition: background var(--transition); }
        .aop-page-btn:hover:not(:disabled) { background: var(--color-bg-2); }
        .aop-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .aop-page-info { font-size: 0.82rem; color: var(--color-text-subtle); }

        @keyframes expand-in { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
