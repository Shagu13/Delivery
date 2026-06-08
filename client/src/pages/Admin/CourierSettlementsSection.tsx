import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { fetchCouriers } from '../../api/couriers';
import type { Courier } from '../../api/couriers';
import { SettlementModal } from './SettlementModal';

/**
 * Courier daily-settlement management, hosted on the Admin Finance page.
 * Pick a courier, then open the settlement manager (create/update for a date).
 * Reuses the existing SettlementModal so the courier settlement logic is unchanged.
 */
export function CourierSettlementsSection({ token, onSettled }: { token: string; onSettled?: () => void }) {
    const { t } = useLanguage();
    const [couriers, setCouriers] = useState<Courier[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [open, setOpen] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    useEffect(() => {
        fetchCouriers(token).then(setCouriers).catch(() => setCouriers([]));
    }, [token]);

    const selected = couriers.find(c => c.courierId === selectedId) ?? null;

    return (
        <div className="content-card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    className="go-select"
                    value={selectedId}
                    onChange={e => setSelectedId(e.target.value)}
                    style={{ minWidth: 240 }}
                >
                    <option value="">{t.finCourierSelect}</option>
                    {couriers.map(c => (
                        <option key={c.courierId} value={c.courierId}>
                            {c.fullName}{c.isDeleted ? ' (inactive)' : ''}
                        </option>
                    ))}
                </select>
                <button className="btn-primary" disabled={!selected} onClick={() => setOpen(true)}>
                    {t.finCourierOpen}
                </button>
            </div>

            {!selected && (
                <div style={{ marginTop: 10, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {t.finCourierPrompt}
                </div>
            )}

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
