import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { trackParcel, type TrackOrderResult } from '../../services/tracking';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import './home.css';

//const STATUS_CLASS: Record<string, string> = {
//    Pending:                         'track-badge--pending',
//    AcceptedGroupOrder:              'track-badge--assigned',
//    OrderNotAccepted:                'track-badge--failed',
//    CourierAssignedToPickUp:         'track-badge--assigned',
//    CourierOnTheWayToPickUp:         'track-badge--assigned',
//    CourierDeliveringToWarehouse:    'track-badge--delivering',
//    DeliveredToWarehouse:            'track-badge--inwarehouse',
//    AdminAcceptedOrderInWareHouse:   'track-badge--inwarehouse',
//    CancelledBySender:               'track-badge--failed',
//    AcceptedOrder:                   'track-badge--assigned',
//    OrderIsOnItsWayToRecipientsCity: 'track-badge--onitsway',
//    CourierAssignedToDeliver:        'track-badge--assigned',
//    CourierRecievedOrderToDeliver:   'track-badge--delivering',
//    DeliveredToRecipient:            'track-badge--delivered',
//    CancelledByAdmin:                'track-badge--failed',
//};

function formatDate(iso: string, lang: string) {
    return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

function HeroIllustration() {
    return (
        <img
            src="/dilo_logo.png"
            alt="Delivery logo"
            className="home__hero-svg home__hero-logo"
        />
    );
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

    return (
        <div className="home">

            {/* ══ 1. HERO ══ */}
            <section className="home__hero-section">

                {/* Left — text + actions */}
                <div className="home__hero-left">
                    <div className="home__eyebrow">
                        <span className="home__eyebrow-dot" />
                        {t.homeEyebrow}
                    </div>

                    <h1 className="home__title">
                        {t.homeTitle1}<br />
                        <span className="home__title-accent">{t.homeTitle2}</span>
                    </h1>

                    <p className="home__subtitle">{t.homeSubtitle}</p>

                    <div className="home__track-card">
                        <p className="home__track-label">{t.homeTrackLabel}</p>
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
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    <div className="home__divider">{t.or}</div>

                    <Link to="/send" className="home__send-btn">
                        {t.homeSendPackages}
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </Link>
                </div>

                {/* Right — illustration */}
                <div className="home__hero-right">
                    <HeroIllustration />
                </div>
            </section>

            {/* ══ 2. HOW IT WORKS ══ */}
            <section className="home__how-section">
                <p className="home__section-eyebrow">Simple Process</p>
                <h2 className="home__section-title">How DILO works</h2>
                <p className="home__section-sub">Three steps from your hands to theirs</p>

                <div className="home__steps">
                    <div className="home__step">
                        <div className="home__step-number">01</div>
                        <div className="home__step-icon">
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                <rect x="3" y="6" width="16" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                                <path d="M7 6V5a4 4 0 0 1 8 0v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                                <path d="M8 11h6M8 14h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <p className="home__step-name">Place your order</p>
                        <p className="home__step-desc">Register and submit your shipment details. A unique tracking number is generated instantly.</p>
                    </div>
                    <div className="home__step">
                        <div className="home__step-number">02</div>
                        <div className="home__step-icon">
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                <path d="M3 9l8-6 8 6v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                                <path d="M8 19v-7h6v7" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <p className="home__step-name">Pickup & warehouse</p>
                        <p className="home__step-desc">Our courier picks up the package and brings it to our warehouse for sorting and processing.</p>
                    </div>
                    <div className="home__step">
                        <div className="home__step-number">03</div>
                        <div className="home__step-icon">
                            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                <rect x="1" y="11" width="20" height="8" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                                <path d="M4 11V8a7 7 0 0 1 14 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                                <circle cx="6" cy="19" r="2" fill="currentColor"/>
                                <circle cx="16" cy="19" r="2" fill="currentColor"/>
                            </svg>
                        </div>
                        <p className="home__step-name">Last-mile delivery</p>
                        <p className="home__step-desc">A dedicated courier delivers directly to the recipient's door, anywhere across Georgia.</p>
                    </div>
                </div>
            </section>

            {/* ══ 3. WHY DILO ══ */}
            <section className="home__why-section">
                <p className="home__section-eyebrow">Why Choose Us</p>
                <h2 className="home__section-title">Why choose DILO?</h2>
                <p className="home__section-sub">Built for businesses and individuals alike</p>

                <div className="home__features">
                    <div className="home__feature">
                        <div className="home__feature-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5"/>
                                <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div className="home__feature-body">
                            <p className="home__feature-name">Real-time tracking</p>
                            <p className="home__feature-desc">Know exactly where your package is at every stage of the delivery process with live status updates.</p>
                        </div>
                    </div>
                    <div className="home__feature">
                        <div className="home__feature-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M10 2l7 3v5c0 4-3 7-7 8C6 17 3 14 3 10V5l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div className="home__feature-body">
                            <p className="home__feature-name">Secure warehousing</p>
                            <p className="home__feature-desc">Packages are safely stored in our facility until a courier is ready for last-mile dispatch.</p>
                        </div>
                    </div>
                    <div className="home__feature">
                        <div className="home__feature-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <rect x="2" y="5" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M2 9h16M6 13h3M13 13h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                        </div>
                        <div className="home__feature-body">
                            <p className="home__feature-name">Business accounts</p>
                            <p className="home__feature-desc">Bulk shipments, custom pricing, and a full dashboard for managing your business orders.</p>
                        </div>
                    </div>
                    <div className="home__feature">
                        <div className="home__feature-icon">
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M10 3a7 7 0 1 0 0 14A7 7 0 0 0 10 3z" stroke="currentColor" strokeWidth="1.5"/>
                                <path d="M10 7v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div className="home__feature-body">
                            <p className="home__feature-name">Reliable & safe</p>
                            <p className="home__feature-desc">Every parcel is handled with care. We take full responsibility from pickup to final delivery.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══ 4. STATS ══ */}
            <section className="home__stats-section">
                <div className="home__stats">
                    <div className="home__stat"><div className="home__stat-value">50K+</div><div className="home__stat-label">Parcels delivered</div></div>
                    <div className="home__stat"><div className="home__stat-value">98%</div><div className="home__stat-label">On-time rate</div></div>
                    <div className="home__stat"><div className="home__stat-value">70+</div><div className="home__stat-label">Cities covered</div></div>
                    <div className="home__stat"><div className="home__stat-value">24h</div><div className="home__stat-label">Avg. delivery time</div></div>
                </div>
            </section>

            {/* ══ 5. CTA ══ */}
            <section className="home__cta-section">
                <div className="home__cta-card">
                    <h2 className="home__cta-title">Ready to send your<br />first package?</h2>
                    <p className="home__cta-sub">Create a free account and experience fast, reliable delivery across Georgia.</p>
                    <div className="home__cta-actions">
                        <Link to="/register" className="home__cta-primary">
                            Create account
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                        <Link to="/send" className="home__cta-secondary">Send a package</Link>
                    </div>
                </div>
            </section>

            {/* ══ TRACKING MODAL ══ */}
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
                                    <div className="track-badge-wrapper">

                                        {badgeMeta?.description && (
                                            <p className="track-badge__description">{badgeMeta.description}</p>
                                        )}
                                    </div>
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
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">{t.trackRecipientAddr}</span>
                                        <span className="track-modal__info-value">{result.recipientAddress}</span>
                                    </div>
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
