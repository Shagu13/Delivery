import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { trackParcel, type TrackOrderResult } from '../../services/tracking';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import './home.css';

const STATUS_CLASS: Record<string, string> = {
    // GroupOrder flow
    Pending:                         'track-badge--pending',
    AcceptedGroupOrder:              'track-badge--assigned',
    OrderNotAccepted:                'track-badge--failed',
    CourierAssignedToPickUp:         'track-badge--assigned',
    CourierOnTheWayToPickUp:         'track-badge--assigned',
    CourierDeliveringToWarehouse:    'track-badge--delivering',
    DeliveredToWarehouse:            'track-badge--inwarehouse',
    AdminAcceptedOrderInWareHouse:   'track-badge--inwarehouse',
    CancelledBySender:               'track-badge--failed',
    // Order last-mile flow
    AcceptedOrder:                   'track-badge--assigned',
    OrderIsOnItsWayToRecipientsCity: 'track-badge--onitsway',
    CourierAssignedToDeliver:        'track-badge--assigned',
    CourierRecievedOrderToDeliver:   'track-badge--delivering',
    DeliveredToRecipient:            'track-badge--delivered',
    CancelledByAdmin:                'track-badge--failed',
};

function formatDate(iso: string, lang: string) {
    return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

export function HomePage() {
    const { t, lang } = useLanguage();
    const [trackingNumber, setTrackingNumber] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [result,   setResult]   = useState<TrackOrderResult | null>(null);
    const [error,    setError]    = useState<'NOT_FOUND' | 'SERVER_ERROR' | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const isModalOpen = loading || result !== null || error !== null;

    async function handleTrack(e: React.FormEvent) {
        e.preventDefault();
        const tn = trackingNumber.trim();
        if (!tn) return;
        setLoading(true); setResult(null); setError(null);
        try {
            setResult(await trackParcel(tn));
        } catch (err: unknown) {
            setError(err instanceof Error && err.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'SERVER_ERROR');
        } finally {
            setLoading(false);
        }
    }

    function closeModal() { setResult(null); setError(null); setLoading(false); }

    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
        document.addEventListener('keydown', h);
        return () => document.removeEventListener('keydown', h);
    }, []);

    useEffect(() => {
        document.body.style.overflow = isModalOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isModalOpen]);

    const badgeMeta  = result ? getStatusMeta(result.status, lang) : null;
    const badgeClass = result ? (STATUS_CLASS[result.status] ?? 'track-badge--pending') : '';
    const badgeLabel = badgeMeta?.short ?? '';

    return (
        <div className="home">
            <main className="home__main">
                <div className="home__hero">
                    <p className="home__eyebrow">{t.homeEyebrow}</p>
                    <h1 className="home__title">
                        {t.homeTitle1}<br />
                        <span className="home__title-accent">{t.homeTitle2}</span>
                    </h1>
                    <p className="home__subtitle">{t.homeSubtitle}</p>

                    <div className="home__actions">
                        <div className="home__card">
                            <p className="home__card-label">{t.homeTrackLabel}</p>
                            <form className="home__track-form" onSubmit={handleTrack}>
                                <input
                                    className="home__track-input"
                                    type="text"
                                    placeholder={t.phTrackingNumber}
                                    value={trackingNumber}
                                    onChange={e => setTrackingNumber(e.target.value)}
                                />
                                <button type="submit" className="home__track-btn" disabled={loading}>
                                    {loading ? t.homeTracking : (
                                        <>
                                            {t.homeTrack}
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        <div className="home__divider">{t.or}</div>

                        <Link to="/send" className="home__send-btn">
                            {t.homeSendPackages}
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </main>

            {/* ── Tracking Modal ── */}
            {isModalOpen && (
                <div className="track-overlay" onClick={closeModal} role="dialog" aria-modal="true">
                    <div className="track-modal" ref={modalRef} onClick={e => e.stopPropagation()}>
                        <div className="track-modal__header">
                            <span className="track-modal__tn">{trackingNumber.trim().toUpperCase()}</span>
                            <button className="track-modal__close" onClick={closeModal} aria-label={t.close}>
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>

                        {loading && (
                            <div className="track-modal__state">
                                <div className="track-modal__spinner" />
                                {t.trackLookingUp}
                            </div>
                        )}

                        {!loading && error === 'NOT_FOUND' && (
                            <div className="track-modal__state track-modal__state--error">
                                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                                    <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M18 11v8M18 24v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <p>{t.trackNotFoundTitle} <strong>{trackingNumber.trim().toUpperCase()}</strong>.</p>
                                <p className="track-modal__state-hint">{t.trackNotFoundHint}</p>
                            </div>
                        )}

                        {!loading && error === 'SERVER_ERROR' && (
                            <div className="track-modal__state track-modal__state--error">
                                <p>{t.trackServerError}</p>
                            </div>
                        )}

                        {!loading && result && (
                            <div className="track-modal__body">
                                <div className="track-modal__status-row">
                                    <span
                                      className={`track-badge ${badgeClass}`}
                                      title={badgeMeta?.description}
                                    >
                                        <span className="track-badge__dot" />
                                        {badgeLabel}
                                    </span>
                                </div>

                                <div className="track-modal__info">
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">{t.trackRecipient}</span>
                                        <span className="track-modal__info-value">{result.recipientFirstName} {result.recipientLastName}</span>
                                    </div>
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">{t.trackDestination}</span>
                                        <span className="track-modal__info-value">{result.recipientCity}, {result.recipientDistrict}</span>
                                    </div>
                                    {result.warehouseName && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">{t.trackWarehouse}</span>
                                            <span className="track-modal__info-value">{result.warehouseName}</span>
                                        </div>
                                    )}
                                    {result.courierFullName && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">{t.trackCourier}</span>
                                            <span className="track-modal__info-value">{result.courierFullName}</span>
                                        </div>
                                    )}
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">{t.trackRecipientAddr}</span>
                                        <span className="track-modal__info-value">{result.recipientAddress}</span>
                                    </div>
                                    {result.deliveredAt && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">{t.trackDelivered}</span>
                                            <span className="track-modal__info-value">{formatDate(result.deliveredAt, lang)}</span>
                                        </div>
                                    )}
                                </div>

                                {result.trackingEvents.length > 0 && (
                                    <div className="track-modal__timeline">
                                        <p className="track-modal__timeline-label">{t.trackEventHistory}</p>
                                        <div className="track-timeline">
                                            {[...result.trackingEvents].reverse().map((ev, idx) => (
                                                <div key={idx} className={`track-timeline__item${idx === 0 ? ' track-timeline__item--latest' : ''}`}>
                                                    <div className="track-timeline__dot-col">
                                                        <div className="track-timeline__dot">
                                                            <div className="track-timeline__dot-inner" />
                                                        </div>
                                                    </div>
                                                    <div className="track-timeline__body">
                                                        <p className="track-timeline__status">{ev.status}</p>
                                                        <p className="track-timeline__desc">{ev.description}</p>
                                                        <p className="track-timeline__time">{formatDate(ev.createdAt, lang)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
