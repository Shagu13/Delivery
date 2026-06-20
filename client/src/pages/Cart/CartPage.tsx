import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useCart } from '../../contexts/useCart';
import { useLanguage } from '../../contexts/useLanguage';
import { checkoutCart, ApiError } from '../../api/groupOrders';
import { recipientDisplayName } from '../../utils/recipientName';
import '../../styles/dashboard.css';

const errorBoxStyle: CSSProperties = {
    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem', padding: '10px 14px',
};

export function CartPage() {
    const { token } = useAuth();
    const { items, sender, count, removeItem, clear } = useCart();
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [confirming, setConfirming] = useState(false);
    const [placing, setPlacing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handlePlace = async () => {
        if (!sender || items.length === 0 || !token) return;
        setPlacing(true);
        setError(null);
        try {
            // CartItem carries an extra clientId; the backend ignores unknown fields.
            await checkoutCart({ ...sender, orders: items }, token);
            clear();
            navigate('/customer?view=shipments');
        } catch (e) {
            setError(e instanceof ApiError ? e.message : t.cartCheckoutError);
            setConfirming(false);
        } finally {
            setPlacing(false);
        }
    };

    return (
        <div style={{ padding: '24px 16px' }}>
            <main style={{ maxWidth: 880, margin: '0 auto' }}>
                <div className="content-card" style={{ marginTop: 24 }}>
                    <div className="content-card__header">
                        <span className="content-card__title">{t.cartHeaderTitle}</span>
                        {count > 0 && (
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)' }}>
                                {t.cartItemsInCart(count)}
                            </span>
                        )}
                    </div>

                    {items.length === 0 ? (
                        <div className="empty-state" style={{ padding: 48 }}>
                            <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
                                <circle cx="16" cy="35" r="2" stroke="currentColor" strokeWidth="1.6" />
                                <circle cx="32" cy="35" r="2" stroke="currentColor" strokeWidth="1.6" />
                                <path d="M2 3h6l4.5 22a3 3 0 0 0 3 2.4h15a3 3 0 0 0 3-2.4L38 9H10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            <span className="empty-state__text">{t.cartEmpty}</span>
                            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 4 }}>
                                {t.cartEmptyHint}
                            </span>
                            <a href="/send" className="btn-primary" style={{ marginTop: 16 }}>{t.cartAddPackage}</a>
                        </div>
                    ) : (
                        <>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            {[t.cartRecipient, t.custThCity, t.custThAddress, t.custThCod].map(h => (
                                                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                                                    fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                                                    color: 'var(--color-text-subtle)' }}>{h}</th>
                                            ))}
                                            <th style={{ padding: '10px 16px' }} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(item => (
                                            <tr key={item.clientId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ padding: '10px 16px' }}>
                                                    <div style={{ fontWeight: 500 }}>{recipientDisplayName(item.recipientName, t.recipientUnknown)}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{item.recipientPhone}</div>
                                                </td>
                                                <td style={{ padding: '10px 16px', color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>
                                                    {item.recipientCity}, {item.recipientDistrict}
                                                </td>
                                                <td style={{ padding: '10px 16px', color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>
                                                    {item.recipientAddress}
                                                </td>
                                                <td style={{ padding: '10px 16px', color: 'var(--color-text)', fontSize: '0.82rem', fontWeight: 600 }}>
                                                    {item.amountToCollectForPackage != null ? `₾${item.amountToCollectForPackage.toFixed(2)}` : '—'}
                                                </td>
                                                <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.clientId)}
                                                        title={t.cartRemove}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: 5,
                                                            padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid rgba(239,68,68,0.35)', background: 'rgba(239,68,68,0.06)',
                                                            color: '#ef4444', fontSize: '0.76rem', fontWeight: 600,
                                                            cursor: 'pointer', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                                                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                        </svg>
                                                        {t.cartRemove}
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {error && (
                                <div role="alert" style={{ ...errorBoxStyle, margin: 16 }}>{error}</div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                gap: 12, padding: 16, flexWrap: 'wrap' }}>
                                <a href="/send" className="btn-ghost" style={{ fontWeight: 600 }}>{t.cartAddPackage}</a>
                                <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => { setError(null); setConfirming(true); }}
                                    disabled={placing}
                                >
                                    {t.cartPlaceOrders}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </main>

            {confirming && (
                <div
                    onClick={() => { if (!placing) setConfirming(false); }}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(26,23,20,0.55)', backdropFilter: 'blur(4px)',
                        zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        role="dialog" aria-modal="true"
                        style={{ width: 'min(460px, 100%)', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)', boxShadow: '0 20px 60px rgba(0,0,0,0.22)', padding: 24 }}
                    >
                        <h3 style={{ margin: '0 0 10px', fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)' }}>
                            {t.cartConfirmTitle}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-subtle)', lineHeight: 1.6 }}>
                            {t.cartConfirmBody(count)}
                        </p>
                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                                borderRadius: 'var(--radius-sm)', color: '#ef4444', fontSize: '0.82rem', padding: '10px 14px', margin: '12px 0 0' }}>
                                {error}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                            <button
                                type="button"
                                onClick={() => setConfirming(false)}
                                disabled={placing}
                                style={{ padding: '10px 18px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', fontWeight: 600,
                                    cursor: placing ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
                                    background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', opacity: placing ? 0.6 : 1 }}
                            >
                                {t.cartConfirmKeep}
                            </button>
                            <button
                                type="button"
                                onClick={handlePlace}
                                disabled={placing}
                                className="btn-primary"
                                style={{ opacity: placing ? 0.7 : 1 }}
                            >
                                {placing ? t.cartPlacing : t.cartConfirmYes}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
