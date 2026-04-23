import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { trackParcel, type TrackOrderResult } from '../../services/tracking';
import './home.css';

// ── Status config ──────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
    Pending:              'Order Placed',
    OnItsWayToWarehouse:  'On Its Way to Warehouse',
    InWarehouse:          'In Warehouse',
    AssignedToCourier:    'Assigned to Courier',
    Delivering:           'Out for Delivery',
    Delivered:            'Delivered',
    Failed:               'Delivery Failed',
};

const STATUS_CLASS: Record<string, string> = {
    Pending:              'track-badge--pending',
    OnItsWayToWarehouse:  'track-badge--onitsway',
    InWarehouse:          'track-badge--inwarehouse',
    AssignedToCourier:    'track-badge--assigned',
    Delivering:           'track-badge--delivering',
    Delivered:            'track-badge--delivered',
    Failed:               'track-badge--failed',
};

function formatDate(iso: string) {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

// ── Component ──────────────────────────────────────────────────
export function HomePage() {
    const [trackingNumber, setTrackingNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TrackOrderResult | null>(null);
    const [error, setError] = useState<'NOT_FOUND' | 'SERVER_ERROR' | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    const isModalOpen = loading || result !== null || error !== null;

    async function handleTrack(e: React.FormEvent) {
        e.preventDefault();
        const tn = trackingNumber.trim();
        if (!tn) return;

        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const data = await trackParcel(tn);
            setResult(data);
        } catch (err: unknown) {
            setError(err instanceof Error && err.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'SERVER_ERROR');
        } finally {
            setLoading(false);
        }
    }

    function closeModal() {
        setResult(null);
        setError(null);
        setLoading(false);
    }

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    // Trap scroll when modal open
    useEffect(() => {
        document.body.style.overflow = isModalOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isModalOpen]);

    const badgeClass = result ? (STATUS_CLASS[result.status] ?? 'track-badge--pending') : '';
    const badgeLabel = result ? (STATUS_LABEL[result.status] ?? result.status) : '';

    return (
        <div className="home">
            <main className="home__main">
                <div className="home__hero">
                    <p className="home__eyebrow">Fast & Reliable</p>
                    <h1 className="home__title">
                        Deliver Anywhere<br />
                        <span className="home__title-accent">Across Georgia</span>
                    </h1>
                    <p className="home__subtitle">
                        Send multiple packages in one request. Track every shipment in real time.
                    </p>

                    <div className="home__actions">
                        {/* Track */}
                        <div className="home__card">
                            <p className="home__card-label">Track a Package</p>
                            <form className="home__track-form" onSubmit={handleTrack}>
                                <input
                                    className="home__track-input"
                                    type="text"
                                    placeholder="Enter tracking number…"
                                    value={trackingNumber}
                                    onChange={e => setTrackingNumber(e.target.value)}
                                />
                                <button type="submit" className="home__track-btn" disabled={loading}>
                                    {loading ? 'Searching…' : (
                                        <>
                                            Track
                                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>

                        <div className="home__divider">or</div>

                        <Link to="/send" className="home__send-btn">
                            Send Packages
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </Link>
                    </div>
                </div>
            </main>

            {/* ── Tracking Modal ───────────────────────────────────────── */}
            {isModalOpen && (
                <div className="track-overlay" onClick={closeModal} role="dialog" aria-modal="true">
                    <div
                        className="track-modal"
                        ref={modalRef}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal header */}
                        <div className="track-modal__header">
                            <span className="track-modal__tn">{trackingNumber.trim().toUpperCase()}</span>
                            <button className="track-modal__close" onClick={closeModal} aria-label="Close">
                                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                </svg>
                            </button>
                        </div>

                        {/* Loading */}
                        {loading && (
                            <div className="track-modal__state">
                                <div className="track-modal__spinner" />
                                Looking up your parcel…
                            </div>
                        )}

                        {/* Not found */}
                        {!loading && error === 'NOT_FOUND' && (
                            <div className="track-modal__state track-modal__state--error">
                                <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                                    <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M18 11v8M18 24v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                <p>No parcel found for <strong>{trackingNumber.trim().toUpperCase()}</strong>.</p>
                                <p className="track-modal__state-hint">Please check the tracking number and try again.</p>
                            </div>
                        )}

                        {/* Server error */}
                        {!loading && error === 'SERVER_ERROR' && (
                            <div className="track-modal__state track-modal__state--error">
                                <p>Something went wrong. Please try again in a moment.</p>
                            </div>
                        )}

                        {/* Result */}
                        {!loading && result && (
                            <div className="track-modal__body">
                                {/* Status badge */}
                                <div className="track-modal__status-row">
                                    <span className={`track-badge ${badgeClass}`}>
                                        <span className="track-badge__dot" />
                                        {badgeLabel}
                                    </span>
                                </div>

                                {/* Info grid */}
                                <div className="track-modal__info">
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">Recipient</span>
                                        <span className="track-modal__info-value">
                                            {result.recipientFirstName} {result.recipientLastName}
                                        </span>
                                    </div>
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">Destination</span>
                                        <span className="track-modal__info-value">
                                            {result.recipientCity}, {result.recipientDistrict}
                                        </span>
                                    </div>
                                    {result.warehouseName && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">Warehouse</span>
                                            <span className="track-modal__info-value">{result.warehouseName}</span>
                                        </div>
                                    )}
                                    {result.courierFullName && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">Courier</span>
                                            <span className="track-modal__info-value">{result.courierFullName}</span>
                                        </div>
                                    )}
                                    <div className="track-modal__info-item">
                                        <span className="track-modal__info-label">Recipient Address</span>
                                        <span className="track-modal__info-value">{result.recipientAddress}</span>
                                    </div>
                                    {result.deliveredAt && (
                                        <div className="track-modal__info-item">
                                            <span className="track-modal__info-label">Delivered</span>
                                            <span className="track-modal__info-value">{formatDate(result.deliveredAt)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Timeline */}
                                {result.trackingEvents.length > 0 && (
                                    <div className="track-modal__timeline">
                                        <p className="track-modal__timeline-label">Event History</p>
                                        <div className="track-timeline">
                                            {[...result.trackingEvents].reverse().map((ev, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`track-timeline__item${idx === 0 ? ' track-timeline__item--latest' : ''}`}
                                                >
                                                    <div className="track-timeline__dot-col">
                                                        <div className="track-timeline__dot">
                                                            <div className="track-timeline__dot-inner" />
                                                        </div>
                                                    </div>
                                                    <div className="track-timeline__body">
                                                        <p className="track-timeline__status">{ev.status}</p>
                                                        <p className="track-timeline__desc">{ev.description}</p>
                                                        <p className="track-timeline__time">{formatDate(ev.createdAt)}</p>
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
