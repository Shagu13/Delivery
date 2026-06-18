import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import { fetchCouriersWithDeliveries } from '../../api/settlements';
import { SettlementModal } from './SettlementModal';

const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const shiftIso = (iso: string, delta: number) => {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Courier daily-settlement management, hosted on the Admin Finance page.
 * Optionally filter by a delivery date: pick a date and only couriers who delivered
 * orders that day are listed; leave the date empty to list every courier.
 * Pick a courier, then open the settlement manager (create/update for the date).
 */
export function CourierSettlementsSection({ token, onSettled }: { token: string; onSettled?: () => void }) {
    const { t } = useLanguage();
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [date, setDate] = useState('');                       // '' = all couriers
    const [activeIds, setActiveIds] = useState<string[] | null>(null); // null = no date filter
    const [loadingIds, setLoadingIds] = useState(false);
    const [selectedId, setSelectedId] = useState('');
    const [open, setOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        fetchCouriers(token).then(setCouriers).catch(() => setCouriers([]));
    }, [token]);

    // When a date is chosen, load which couriers delivered that day; clear the filter
    // (show all) when the date is emptied.
    useEffect(() => {
        if (!date) { setActiveIds(null); return; }
        let cancelled = false;
        setLoadingIds(true);
        fetchCouriersWithDeliveries(date, token)
            .then(ids => { if (!cancelled) setActiveIds(ids); })
            .catch(() => { if (!cancelled) setActiveIds([]); })
            .finally(() => { if (!cancelled) setLoadingIds(false); });
        return () => { cancelled = true; };
    }, [date, token]);

    // Couriers visible in the dropdown: all when no date filter, else only those who
    // delivered on the chosen date.
    const visibleCouriers = activeIds === null
        ? couriers
        : couriers.filter(c => activeIds.includes(c.courierId));

    // Drop the selection if the chosen courier falls out of the filtered list.
    useEffect(() => {
        if (selectedId && !visibleCouriers.some(c => c.courierId === selectedId)) {
            setSelectedId('');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date, activeIds]);

    const selected = visibleCouriers.find(c => c.courierId === selectedId) ?? null;
    const noneForDate = !!date && !loadingIds && visibleCouriers.length === 0;

    return (
        <div className="content-card" style={{ padding: 16 }}>
            {/* Date filter */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{t.finCourierDateLabel}</span>
                <button onClick={() => setDate(d => shiftIso(d || isoToday(), -1))} title={t.statPrevDay} style={dateNavBtn}>‹</button>
                <input type="date" value={date} max={isoToday()} onChange={e => setDate(e.target.value)} style={dateInputStyle} />
                <button
                    onClick={() => { const next = shiftIso(date || isoToday(), 1); if (next <= isoToday()) setDate(next); }}
                    disabled={!date || date >= isoToday()}
                    title={t.statNextDay}
                    style={{ ...dateNavBtn, opacity: (!date || date >= isoToday()) ? 0.4 : 1, cursor: (!date || date >= isoToday()) ? 'not-allowed' : 'pointer' }}
                >›</button>
                {date && (
                    <button onClick={() => setDate('')} title={t.finAllDates}
                        style={{ background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)', width: 28, height: 28, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>×</button>
                )}
                {loadingIds && <span className="go-spinner" style={{ width: 14, height: 14 }} />}
            </div>

            {/* Courier picker */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    className="go-select"
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    style={{ minWidth: 240 }}
                    disabled={noneForDate}
                >
                    <option value="">{t.finCourierSelect}</option>
                    {visibleCouriers.map(c => (
                        <option key={c.courierId} value={c.courierId}>
                            {c.fullName}{c.isDeleted ? ' (inactive)' : ''}
                        </option>
                    ))}
                </select>
                <button className="btn-primary" disabled={!selected} onClick={() => setOpen(true)}>
                    {t.finCourierOpen}
                </button>
            </div>

            <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                {noneForDate ? t.finCourierNoneForDate : !selected ? t.finCourierPrompt : t.finCourierDateHint}
            </div>

            {selected && (
                <SettlementModal
                    open={open}
                    onClose={() => setOpen(false)}
                    onCreated={() => {
                        setToast(t.finCourierSavedToast(selected.fullName));
                        setTimeout(() => setToast(null), 4000);
                        onSettled?.();
                    }}
                    courierId={selected.courierId}
                    courierFullName={selected.fullName}
                    token={token}
                    initialDate={date || isoToday()}
                />
            )}

            {toast && (
                <div className="toast" role="status">
                    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {toast}
                </div>
            )}
        </div>
    );
}

const dateInputStyle: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)', fontSize: '0.82rem',
    padding: '5px 8px', outline: 'none',
};

const dateNavBtn: React.CSSProperties = {
    background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
    fontSize: '0.95rem', lineHeight: 1, padding: '5px 10px', cursor: 'pointer',
};
