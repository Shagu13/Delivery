import { useState, useEffect, useMemo } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchGroupOrders, type AdminGroupOrder, type AdminOrder } from '../../api/adminGroupOrders';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { recipientDisplayName } from '../../utils/recipientName';
import { Highlight } from '../../components/ui/Highlight';

type Party = 'sender' | 'recipient';
type DestView = 'packagesTest' | 'returnExchange' | 'history';
interface Dest { view: DestView; label: string; }

const PAGE_SIZE = 50;
const MIN_LEN   = 2;

// Persist the last Order Search term + scope for the session so returning to the page
// (after a "Go To" jump) restores what was typed.
const OS_SEARCH_KEY = 'adminOrderSearch.search';
const OS_PARTY_KEY  = 'adminOrderSearch.party';

// Terminal statuses live on the History page. Anything else in-flow is "active" (Packages).
const TERMINAL_STATUSES = new Set<string>([
  'DeliveredToRecipient', 'AllDelivered', 'ExchangeCompleted', 'ReturnedToSender',
  'CancelledByAdmin', 'CancelledBySender', 'OrderNotAccepted', 'DeliveredReturnOrderToWarehouse',
]);

// ── Result row ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  const [bg, color] = STATUS_COLORS[status] ?? ['rgba(107,114,128,0.12)', '#6b7280'];
  return (
    <span title={meta.description} style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 100,
      fontSize: '0.72rem', fontWeight: 700, background: bg, color, whiteSpace: 'nowrap',
    }}>
      {meta.short}
    </span>
  );
}

function ResultRow({
  go, o, term, party, dests, onGo,
}: {
  go: AdminGroupOrder; o: AdminOrder; term: string; party: Party;
  dests: Dest[]; onGo: (view: DestView) => void;
}) {
  const { t } = useLanguage();
  const [dest, setDest] = useState<DestView>(dests[0].view);

  return (
    <tr>
      <td><span className="tn-badge"><Highlight text={o.trackingNumber} term={term} /></span></td>
      <td>
        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
          <Highlight text={go.senderBusinessName || '—'} term={party === 'sender' ? term : ''} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>
          <Highlight text={go.senderPhone} term={party === 'sender' ? term : ''} />
        </div>
      </td>
      <td>
        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
          <Highlight text={recipientDisplayName(o.recipientName, t.recipientUnknown)} term={party === 'recipient' ? term : ''} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', fontFamily: 'monospace' }}>
          <Highlight text={o.recipientPhone} term={party === 'recipient' ? term : ''} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
          <Highlight text={`${o.recipientCity}, ${o.recipientDistrict}`} term={party === 'recipient' ? term : ''} />
        </div>
        {o.recipientAddress && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
            <Highlight text={o.recipientAddress} term={party === 'recipient' ? term : ''} />
          </div>
        )}
      </td>
      <td><StatusBadge status={o.status} /></td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {dests.length > 1 && (
            <select
              value={dest}
              onChange={e => setDest(e.target.value as DestView)}
              style={{
                background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                fontSize: '0.78rem', padding: '4px 8px',
              }}
            >
              {dests.map(d => <option key={d.view} value={d.view}>{d.label}</option>)}
            </select>
          )}
          <button
            type="button"
            className="go-action-btn go-action-btn--assign"
            onClick={() => onGo(dests.length > 1 ? dest : dests[0].view)}
            style={{ fontSize: '0.75rem', padding: '4px 12px', whiteSpace: 'nowrap' }}
          >
            {dests.length > 1 ? t.osGoTo : `${t.osGoTo}: ${dests[0].label}`}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────────

export default function AdminOrderSearchPage({ token, onGoTo }: {
  token: string;
  onGoTo: (view: DestView, trackingNumber: string) => void;
}) {
  const { t } = useLanguage();
  // Remember the last search across visits: the page unmounts when the admin navigates away
  // (e.g. via a "Go To"), so keep the term + scope in sessionStorage and re-seed on return.
  const [search, setSearch]                 = useState(() => sessionStorage.getItem(OS_SEARCH_KEY) ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => sessionStorage.getItem(OS_SEARCH_KEY) ?? '');
  const [party, setParty]                   = useState<Party>(() => (sessionStorage.getItem(OS_PARTY_KEY) as Party) || 'sender');
  const [page, setPage]                     = useState(1);

  useEffect(() => {
    sessionStorage.setItem(OS_SEARCH_KEY, search);
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => { sessionStorage.setItem(OS_PARTY_KEY, party); }, [party]);

  useEffect(() => { setPage(1); }, [debouncedSearch, party]);

  const enabled = debouncedSearch.trim().length >= MIN_LEN;

  const query = useQuery({
    queryKey: ['admin', 'orderSearch', debouncedSearch, party] as const,
    queryFn: () => fetchGroupOrders(token, { search: debouncedSearch, party, pageSize: 300 }),
    enabled,
    placeholderData: keepPreviousData,
  });

  const groups = enabled ? (query.data?.items ?? []) : [];

  // The server returns whole matched batches; keep only the child orders that actually match
  // the term on the chosen side, so sibling packages in the same batch don't clutter results.
  const results = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return [] as { go: AdminGroupOrder; o: AdminOrder }[];
    const flat: { go: AdminGroupOrder; o: AdminOrder }[] = [];
    for (const go of groups) {
      for (const o of go.orders) {
        if (orderMatches(go, o, q, party)) flat.push({ go, o });
      }
    }
    return flat;
  }, [groups, debouncedSearch, party]);

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * PAGE_SIZE;
  const paged      = results.slice(pageStart, pageStart + PAGE_SIZE);

  const destinationsFor = (o: AdminOrder): Dest[] => {
    const isRE = o.orderType === 'Return' || o.orderType === 'Exchange';
    const terminal = TERMINAL_STATUSES.has(o.status) || o.cancelledReturnedToSenderAt != null;
    const dests: Dest[] = [];
    if (isRE) dests.push({ view: 'returnExchange', label: t.navReturnExchange });
    if (terminal) dests.push({ view: 'history', label: t.topbarHistory });
    if (!isRE && !terminal) dests.push({ view: 'packagesTest', label: t.osPackages });
    if (dests.length === 0) dests.push({ view: 'packagesTest', label: t.osPackages });
    return dests;
  };

  const goToOrder = (view: DestView, o: AdminOrder) => {
    onGoTo(view, o.trackingNumber);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>🔎 {t.osTitle}</h2>
        <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>{t.osSubtitle}</p>
      </div>

      {/* Search + scope toggle */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
          {(['sender', 'recipient'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setParty(p)}
              style={{
                padding: '8px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                background: party === p ? 'var(--color-accent)' : 'transparent',
                color: party === p ? '#fff' : 'var(--color-text-subtle)',
              }}
            >
              {p === 'sender' ? t.goSender : t.goThRecipient}
            </button>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="var(--color-text-subtle)" strokeWidth="1.4"/>
            <path d="M10 10l3 3" stroke="var(--color-text-subtle)" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t.osPlaceholder}
            autoFocus
            autoComplete="off"
            style={{
              width: '100%', padding: '11px 36px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
              color: 'var(--color-text)', fontSize: '0.9rem', fontFamily: 'var(--font-body)',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--color-bg-3)', color: 'var(--color-text-subtle)' }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* States */}
      {!enabled && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
          {t.osHint}
        </div>
      )}
      {enabled && query.isPending && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
          <div className="go-spinner" style={{ margin: '0 auto 8px' }} />{t.loading}
        </div>
      )}
      {enabled && !query.isPending && results.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
          {t.osNoResults}
        </div>
      )}

      {enabled && results.length > 0 && (
        <>
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
            {results.length} {t.goOrdersMatched}
          </div>
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <table className="go-orders-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th>{t.reThTracking}</th>
                  <th>{t.reThSender}</th>
                  <th>{t.reThRecipient}</th>
                  <th>{t.reThStatus}</th>
                  <th>{t.osBelongsTo}</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(({ go, o }) => (
                  <ResultRow
                    key={o.id}
                    go={go}
                    o={o}
                    term={debouncedSearch}
                    party={party}
                    dests={destinationsFor(o)}
                    onGo={view => goToOrder(view, o)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {results.length > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 600, cursor: safePage <= 1 ? 'not-allowed' : 'pointer', opacity: safePage <= 1 ? 0.5 : 1 }}
              >
                {t.histPrevPage}
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
                {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, results.length)} / {results.length}
              </span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 600, cursor: safePage >= totalPages ? 'not-allowed' : 'pointer', opacity: safePage >= totalPages ? 0.5 : 1 }}
              >
                {t.histNextPage}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Party-scoped substring match (mirrors the server's sender/recipient scoping). Tracking
// number matches under either scope.
function orderMatches(go: AdminGroupOrder, o: AdminOrder, q: string, party: Party): boolean {
  if (o.trackingNumber.toLowerCase().includes(q)) return true;
  if (party === 'sender') {
    return [go.senderBusinessName, go.senderFirstName, go.senderLastName, go.senderPhone,
            go.pickUpCity, go.pickUpDistrict, go.pickUpAddress]
      .some(f => (f ?? '').toLowerCase().includes(q));
  }
  return [o.recipientName, o.recipientPhone, o.recipientCity, o.recipientDistrict, o.recipientAddress,
          o.returnPickupCity, o.returnPickupDistrict, o.returnPickupAddress]
    .some(f => (f ?? '').toLowerCase().includes(q));
}
