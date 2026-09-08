import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useLanguage } from '../../contexts/useLanguage';
import {
    fetchGroupOrders, softDeleteOrder, softDeleteGroupOrder, bulkSoftDeleteOrders,
    type AdminGroupOrder, type AdminOrder, type BulkSoftDeleteResult,
} from '../../api/adminGroupOrders';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { recipientDisplayName } from '../../utils/recipientName';
import { Highlight } from '../../components/ui/Highlight';
import { PhoneActions } from '../../components/ui/PhoneActions';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useOrdersChangedSignal } from '../../realtime/useOrdersChangedSignal';
import { formatGeorgianDateTime } from '../../utils/georgianTime';

// Layout is inline styles + the .go-orders-table / .tn-badge / .go-spinner / .go-action-btn
// / .action-toast classes injected by AdminDashboard's <style> block (this page only ever
// renders inside it), mirroring AdminOrderSearchPage — no separate stylesheet.

type Party = 'sender' | 'recipient';
const MIN_LEN = 2;

/** What the confirm dialog is about — one package, a whole batch, or the multi-select set. */
type Target =
    | { kind: 'order'; id: string }
    | { kind: 'batch'; id: string; count: number }
    | { kind: 'bulk'; ids: string[] };

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

export default function AdminDeletePackagePage({ token }: { token: string }) {
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [party, setParty] = useState<Party>('recipient');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    // Batch ids whose expand/collapse the admin flipped away from the default
    // (default: a batch that matched on a single order is open, a whole-batch match is collapsed).
    const [flipped, setFlipped] = useState<Set<string>>(new Set());
    const [target, setTarget] = useState<Target | null>(null);
    const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

    useEffect(() => {
        const id = setTimeout(() => setDebounced(search), 300);
        return () => clearTimeout(id);
    }, [search]);

    // A new search / scope invalidates the current selection and expand/collapse overrides.
    useEffect(() => { setSelected(new Set()); setFlipped(new Set()); }, [debounced, party]);

    useEffect(() => {
        if (!toast) return;
        const id = setTimeout(() => setToast(null), 3600);
        return () => clearTimeout(id);
    }, [toast]);

    const enabled = debounced.trim().length >= MIN_LEN;

    const query = useQuery({
        queryKey: ['admin', 'deletePackage', debounced, party] as const,
        queryFn: () => fetchGroupOrders(token, { search: debounced, party, pageSize: 300 }),
        enabled,
        placeholderData: keepPreviousData,
    });

    // Another admin deleting (or otherwise changing) a package elsewhere refreshes the
    // current search list so it never shows a row that no longer exists.
    useOrdersChangedSignal(token, 'adminOrdersChanged', () => {
        if (enabled) void query.refetch();
    });

    // Keep only batches with at least one order matching the term on the chosen side.
    const batches = useMemo(() => {
        const q = debounced.trim().toLowerCase();
        if (!q) return [] as { go: AdminGroupOrder; orders: AdminOrder[] }[];
        const out: { go: AdminGroupOrder; orders: AdminOrder[] }[] = [];
        for (const go of query.data?.items ?? []) {
            const matched = go.orders.filter(o => orderMatches(go, o, q, party));
            if (matched.length > 0) out.push({ go, orders: matched });
        }
        return out;
    }, [query.data, debounced, party]);

    const totalMatched = batches.reduce((n, b) => n + b.orders.length, 0);

    const toggleOne = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const setMany = (ids: string[], on: boolean) => setSelected(prev => {
        const next = new Set(prev);
        for (const id of ids) {
            if (on) next.add(id); else next.delete(id);
        }
        return next;
    });
    const toggleExpand = (id: string) => setFlipped(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    const mutation = useMutation({
        mutationFn: async (): Promise<BulkSoftDeleteResult | null> => {
            if (!target) return null;
            if (target.kind === 'order') { await softDeleteOrder(token, target.id); return null; }
            if (target.kind === 'batch') { await softDeleteGroupOrder(token, target.id); return null; }
            return bulkSoftDeleteOrders(token, target.ids);
        },
        onSuccess: (res) => {
            if (res) {
                setToast({ msg: `${res.deletedOrders} ${t.delPkgBulkDeleted}` });
                setSelected(new Set());
            } else {
                setToast({ msg: target?.kind === 'batch' ? t.delPkgBatchDeleted : t.delPkgDeleted });
            }
            setTarget(null);
            queryClient.invalidateQueries({ queryKey: ['admin'] });
        },
        onError: () => setToast({ msg: t.delPkgFailed, err: true }),
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: selected.size > 0 ? 72 : 0 }}>
            <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>🗑 {t.navDeletePackage}</h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#ef4444' }}>{t.delPkgSubtitle}</p>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', flexShrink: 0 }}>
                    {(['recipient', 'sender'] as const).map(p => (
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
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={t.delPkgPlaceholder}
                    autoFocus
                    autoComplete="off"
                    style={{
                        flex: 1, minWidth: 240, padding: '11px 14px', borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)', background: 'var(--color-bg-2)',
                        color: 'var(--color-text)', fontSize: '16px', fontFamily: 'var(--font-body)',
                        boxSizing: 'border-box',
                    }}
                />
            </div>

            {!enabled && (
                <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
                    {t.delPkgHint}
                </div>
            )}
            {enabled && query.isPending && (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-subtle)' }}>
                    <div className="go-spinner" style={{ margin: '0 auto 8px' }} />{t.loading}
                </div>
            )}
            {enabled && query.isError && (
                <div style={{ padding: 24, textAlign: 'center', color: '#ef4444', fontSize: '0.9rem' }}>{t.delPkgFailed}</div>
            )}
            {enabled && !query.isPending && !query.isError && batches.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>
                    {t.delPkgNoResults}
                </div>
            )}

            {enabled && batches.length > 0 && (
                <>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                        {totalMatched} {t.delPkgResultsCount}
                    </div>
                    {batches.map(({ go, orders }) => {
                        const ids = orders.map(o => o.id);
                        const allSelected = ids.every(id => selected.has(id));
                        // Single-order hits open by default; a whole-batch (sender) match starts
                        // collapsed so the list stays scannable. The admin can flip either.
                        const defaultOpen = orders.length <= 1;
                        const open = flipped.has(go.id) ? !defaultOpen : defaultOpen;
                        return (
                            <div key={go.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', background: 'var(--color-bg-3)', borderBottom: open ? '1px solid var(--color-border)' : 'none' }}>
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={e => setMany(ids, e.target.checked)}
                                        aria-label={t.delPkgSelectBatch}
                                        style={{ width: 18, height: 18, cursor: 'pointer', flexShrink: 0 }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(go.id)}
                                        aria-label={open ? t.delPkgCollapse : t.delPkgExpand}
                                        aria-expanded={open}
                                        style={{
                                            display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0,
                                            background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                                            color: 'var(--color-text)', fontFamily: 'inherit', textAlign: 'left',
                                        }}
                                    >
                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                                            <path d="M5 3l6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            <Highlight text={go.senderBusinessName || '—'} term={party === 'sender' ? debounced : ''} />
                                        </span>
                                    </button>
                                    <PhoneActions phone={go.senderPhone} highlightTerm={party === 'sender' ? debounced : ''} />
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                                        {orders.length === go.orders.length ? orders.length : `${orders.length}/${go.orders.length}`} {t.osPackages}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                                        {formatPlaced(go.createdAt)}
                                    </span>
                                    {!go.isStandalone && go.orders.length > 1 && (
                                        <button
                                            type="button"
                                            className="go-action-btn go-action-btn--decline"
                                            style={{ marginLeft: 'auto' }}
                                            onClick={() => setTarget({ kind: 'batch', id: go.id, count: go.orders.length })}
                                        >
                                            {t.delPkgDeleteBatch}
                                        </button>
                                    )}
                                </div>
                                {open && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="go-orders-table" style={{ minWidth: 720 }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: 36 }} />
                                                <th>{t.reThTracking}</th>
                                                <th>{t.reThRecipient}</th>
                                                <th>{t.reThStatus}</th>
                                                <th>{t.delPkgPlaced}</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orders.map(o => (
                                                <tr key={o.id} style={selected.has(o.id) ? { background: 'rgba(239,68,68,0.06)' } : undefined}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={selected.has(o.id)}
                                                            onChange={() => toggleOne(o.id)}
                                                            aria-label={t.delPkgSelectPackage}
                                                            style={{ width: 18, height: 18, cursor: 'pointer' }}
                                                        />
                                                    </td>
                                                    <td><span className="tn-badge"><Highlight text={o.trackingNumber} term={debounced} /></span></td>
                                                    <td>
                                                        <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                            <Highlight text={recipientDisplayName(o.recipientName, t.recipientUnknown)} term={party === 'recipient' ? debounced : ''} />
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>
                                                            <Highlight text={`${o.recipientCity}, ${o.recipientDistrict}`} term={party === 'recipient' ? debounced : ''} />
                                                        </div>
                                                    </td>
                                                    <td><StatusBadge status={o.status} /></td>
                                                    <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>{formatPlaced(o.createdAt)}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            type="button"
                                                            className="go-action-btn go-action-btn--decline"
                                                            onClick={() => setTarget({ kind: 'order', id: o.id })}
                                                        >
                                                            {t.delPkgDeletePackage}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                )}
                            </div>
                        );
                    })}
                </>
            )}

            {selected.size > 0 && (
                <div style={{
                    position: 'fixed', left: '50%', bottom: 20, transform: 'translateX(-50%)', zIndex: 150,
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px',
                    background: 'var(--color-text)', color: 'var(--color-bg)', borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxWidth: 'calc(100vw - 32px)',
                }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selected.size} {t.delPkgSelected}</span>
                    <button
                        type="button"
                        onClick={() => setSelected(new Set())}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.7, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit' }}
                    >
                        {t.cancel}
                    </button>
                    <button
                        type="button"
                        className="go-action-btn go-action-btn--decline"
                        onClick={() => setTarget({ kind: 'bulk', ids: [...selected] })}
                    >
                        {t.delPkgDeleteSelected} ({selected.size})
                    </button>
                </div>
            )}

            <ConfirmDialog
                open={target !== null}
                variant="danger"
                loading={mutation.isPending}
                title={
                    target?.kind === 'batch' ? t.delPkgConfirmBatchTitle
                    : target?.kind === 'bulk' ? t.delPkgConfirmBulkTitle
                    : t.delPkgConfirmTitle
                }
                message={
                    target?.kind === 'batch' ? t.delPkgConfirmBatchMsg
                    : target?.kind === 'bulk' ? `${target.ids.length} ${t.delPkgSelected} — ${t.delPkgConfirmBulkMsg}`
                    : t.delPkgConfirmMsg
                }
                confirmLabel={t.delPkgConfirmBtn}
                onConfirm={() => mutation.mutate()}
                onCancel={() => setTarget(null)}
            />

            {toast && (
                <div className={`action-toast ${toast.err ? 'action-toast--err' : ''}`}>{toast.msg}</div>
            )}
        </div>
    );
}

// When the package was placed — Georgian wall-clock "DD.MM.YYYY HH:MM".
function formatPlaced(iso: string | null | undefined): string {
    return formatGeorgianDateTime(iso) || '—';
}

// Party-scoped substring match — mirrors the server's sender/recipient scoping. A tracking
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
