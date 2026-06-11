import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackParcel, type TrackOrderResult } from '../../services/tracking';
import { UpdateAppButton } from '../../components/UpdateAppButton';
import { useLanguage } from '../../contexts/useLanguage';
import { getStatusMeta } from '../../utils/statusMeta';
import { type AllDistrictEntry } from '../../api/cities';
import { prefetchCalcData, isCacheValid, _cachedDistricts } from './calcDataCache';
import { PriceCalculatorModal } from './PriceCalculatorModal';
import './home.css';


function formatDate(iso: string, lang: string) {
    return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

/**
 * Lowest non-empty company-service price among active districts whose territory
 * matches `match`. Drives the "from X₾" figure on each tariff card straight from
 * the District records (capital / city / region) seeded in the DB.
 */
/** True when the district belongs to Zugdidi city, in either language. */
function isZugdidiCity(d: AllDistrictEntry): boolean {
    return d.cityName.trim().toLowerCase() === 'zugdidi' || (d.cityNameGeo ?? '').trim() === 'ზუგდიდი';
}

function minDistrictPrice(districts: AllDistrictEntry[], match: (d: AllDistrictEntry) => boolean): number | null {
    const vals = districts
        .filter(d => d.companyServicePrice != null && match(d))
        .map(d => d.companyServicePrice as number);
    return vals.length ? Math.min(...vals) : null;
}

/** "from 6₾" (en) / "6 დან" (ka) figure, big number + small qualifier. */
function PriceFigure({ value, lang, from }: { value: number | null; lang: string; from: string }) {
    const num = value == null ? '—' : (value % 1 === 0 ? String(value) : value.toFixed(2));
    if (lang === 'ka') {
        return (
            <div className="home__tariff-price">
                <span className="home__tariff-num">{num}</span>
                <span className="home__tariff-from">{from}</span>
            </div>
        );
    }
    return (
        <div className="home__tariff-price">
            <span className="home__tariff-from">{from}</span>
            <span className="home__tariff-num">{num === '—' ? num : `${num}₾`}</span>
        </div>
    );
}

export function HomePage() {
    const { t, lang } = useLanguage();
    const location = useLocation();
    const [trackingNumber, setTrackingNumber] = useState('');
    const [loading,  setLoading]  = useState(false);
    const [result,   setResult]   = useState<TrackOrderResult | null>(null);
    const [error,    setError]    = useState<'NOT_FOUND' | 'SERVER_ERROR' | null>(null);
    const [calcOpen, setCalcOpen] = useState(false);
    const [districts, setDistricts] = useState<AllDistrictEntry[]>(() => _cachedDistricts ?? []);
    const modalRef = useRef<HTMLDivElement>(null);

    const isModalOpen = loading || result !== null || error !== null;

    // Real pricing data for the tariff cards (shared cache with the calculator)
    useEffect(() => {
        if (isCacheValid()) {
            if (_cachedDistricts) setDistricts(_cachedDistricts);
            return;
        }
        prefetchCalcData().then(() => { if (_cachedDistricts) setDistricts(_cachedDistricts); });
    }, []);

    // Smooth-scroll to #services / #tariffs / #tracking anchors from the navbar
    useEffect(() => {
        if (!location.hash) return;
        const el = document.getElementById(location.hash.slice(1));
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [location]);

    // Tbilisi → any active Capital-territory district; Cities → any active
    // City-territory district; Regions → any active district with no territory flag.
    const capitalFrom  = minDistrictPrice(districts, d => d.isCapitalTerritory);
    const cityFrom     = minDistrictPrice(districts, d => d.isCityTerritory);
    const districtFrom = minDistrictPrice(districts, d => isZugdidiCity(d) && !d.isCapitalTerritory && !d.isCityTerritory);

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
            <section className="home__hero">
                <div className="home__hero-inner">
                    <div className="home__hero-left">
                        <div className="home__badge">{t.homeBadge}</div>

                        <h1 className="home__title">
                            <span className="home__title-accent">{t.homeTitleAccent}</span><br />
                            {t.homeTitleRest}
                        </h1>

                        <p className="home__subtitle">{t.homeSubtitle}</p>

                        <form className="home__hero-track" onSubmit={handleTrack}>
                            <div className="home__hero-track-field">
                                <svg className="home__hero-track-ico" width="18" height="18" viewBox="0 0 22 22" fill="none">
                                    <rect x="1.5" y="6" width="12" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.6"/>
                                    <path d="M13.5 9h3.6l2.4 3v3h-2" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                                    <circle cx="6" cy="16.5" r="1.8" stroke="currentColor" strokeWidth="1.5"/>
                                    <circle cx="15.5" cy="16.5" r="1.8" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                                <input
                                    className="home__hero-track-input"
                                    type="text"
                                    placeholder={t.phTrackingCode}
                                    value={trackingNumber}
                                    onChange={e => setTrackingNumber(e.target.value)}
                                />
                            </div>
                            <button type="submit" className="home__hero-track-btn" disabled={loading}>
                                {loading ? t.homeTracking : t.homeSearch}
                            </button>
                        </form>

                        <div className="home__trust">
                            <div className="home__trust-item">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                    <path d="M4 12v-2a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                                    <rect x="2.5" y="11" width="3.5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                                    <rect x="14" y="11" width="3.5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                                {t.homeTrust1}
                            </div>
                            <div className="home__trust-item">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 2l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V5l7-3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                {t.homeTrust2}
                            </div>
                            <div className="home__trust-item">
                                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                                    <path d="M10 18s6-5.2 6-9.6A6 6 0 0 0 4 8.4C4 12.8 10 18 10 18z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                    <circle cx="10" cy="8.4" r="2.2" stroke="currentColor" strokeWidth="1.5"/>
                                </svg>
                                {t.homeTrust3}
                            </div>
                        </div>
                    </div>

                    <div className="home__hero-right">
                        <img
                            src="/hero-dilo-girl.png"
                            alt="Dilo Delivery courier"
                            className="home__hero-photo"
                            width={1645}
                            height={956}
                            loading="eager"
                        />
                    </div>
                </div>
            </section>

            {/* ══ 2. STATS ══ */}
            <section className="home__stats-wrap">
                <div className="home__stats-card">
                    <div className="home__stat">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                            <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <div>
                            <div className="home__stat-value">50,000+</div>
                            <div className="home__stat-label">{t.homeStatParcels}</div>
                        </div>
                    </div>
                    <div className="home__stat">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                            <rect x="2" y="6" width="13" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                            <path d="M15 9h3.8l2.7 3.4V16h-2.2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            <circle cx="6.8" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
                            <circle cx="17.3" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.4"/>
                        </svg>
                        <div>
                            <div className="home__stat-value">100+</div>
                            <div className="home__stat-label">{t.homeStatCouriers}</div>
                        </div>
                    </div>
                    <div className="home__stat">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                            <path d="M12 21s7-6 7-11.2A7 7 0 0 0 5 9.8C5 15 12 21 12 21z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            <circle cx="12" cy="9.8" r="2.6" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        <div>
                            <div className="home__stat-value">70+</div>
                            <div className="home__stat-label">{t.homeStatCities}</div>
                        </div>
                    </div>
                    <div className="home__stat">
                        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                            <path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4l-5.2 2.8 1-5.9L3.5 9.2l5.9-.8L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        </svg>
                        <div>
                            <div className="home__stat-value">4.9/5</div>
                            <div className="home__stat-label">{t.homeStatRating}</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══ 3. SERVICES ══ */}
            <section className="home__services-section" id="services">
                <p className="home__section-eyebrow">{t.homeServicesEyebrow}</p>
                <h2 className="home__section-title">{t.homeServicesTitle}</h2>
                <p className="home__section-sub">{t.homeServicesSub}</p>

                <div className="home__services">
                    <div className="home__service">
                        <div className="home__service-head">
                            <div className="home__service-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 3l8 4v10l-8 4-8-4V7l8-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                    <path d="M4 7l8 4 8-4M12 11v10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <p className="home__service-name">{t.homeSvc1Title}</p>
                        </div>
                        <p className="home__service-desc">{t.homeSvc1Desc}</p>
                    </div>
                
                    <div className="home__service">
                        <div className="home__service-head">
                            <div className="home__service-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <path d="M12 2l8 3.5v6c0 4.8-3.6 8.4-8 9.5-4.4-1.1-8-4.7-8-9.5v-6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <p className="home__service-name">{t.homeSvc3Title}</p>
                        </div>
                        <p className="home__service-desc">{t.homeSvc3Desc}</p>
                    </div>
                    <div className="home__service">
                        <div className="home__service-head">
                            <div className="home__service-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="3" width="10" height="18" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                                    <path d="M14 9h5a1 1 0 0 1 1 1v11H14" stroke="currentColor" strokeWidth="1.5"/>
                                    <path d="M7 7h2M7 11h2M7 15h2M16.5 13h1M16.5 17h1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                                </svg>
                            </div>
                            <p className="home__service-name">{t.homeSvc4Title}</p>
                        </div>
                        <p className="home__service-desc">{t.homeSvc4Desc}</p>
                    </div>
                </div>
            </section>

            {/* ══ 4. TRACKING STRIP ══ */}
            <section className="home__trackstrip-wrap" id="tracking">
                <div className="home__trackstrip">
                    <div className="home__trackstrip-left">
                        <div className="home__trackstrip-icon">
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2l8 4.5v9L12 20l-8-4.5v-9L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                                <path d="M4 6.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                            </svg>
                        </div>
                        <div>
                            <p className="home__trackstrip-title">{t.homeTrackTitle}</p>
                            <p className="home__trackstrip-sub">{t.homeTrackSub}</p>
                        </div>
                    </div>
                    <form className="home__trackstrip-form" onSubmit={handleTrack}>
                        <input
                            className="home__trackstrip-input"
                            type="text"
                            placeholder={t.phTrackingCode}
                            value={trackingNumber}
                            onChange={e => setTrackingNumber(e.target.value)}
                        />
                        <button type="submit" className="home__trackstrip-btn" disabled={loading}>
                            {loading ? t.homeTracking : t.homeSearch}
                        </button>
                    </form>
                </div>
            </section>

            {/* ══ 5. TARIFFS ══ */}
            <section className="home__tariffs-wrap" id="tariffs">
                <div className="home__tariffs">
                    <div className="home__tariffs-left">
                        <p className="home__tariffs-eyebrow">{t.homeTariffsEyebrow}</p>
                        <h2 className="home__tariffs-title">{t.homeTariffsTitle}</h2>
                        <p className="home__tariffs-sub">{t.homeTariffsSub}</p>
                        <button type="button" className="home__tariffs-btn" onClick={() => setCalcOpen(true)}>
                            {t.homeTariffsBtn}
                        </button>
                    </div>
                    <div className="home__tariffs-cards">
                        <div className="home__tariff-card">
                            <p className="home__tariff-name">{t.homeTariffCapital}</p>
                            <PriceFigure value={capitalFrom} lang={lang} from={t.homeTariffFrom} />
                            <p className="home__tariff-note">{t.homeTariffCapitalNote}</p>
                        </div>
                        <div className="home__tariff-card home__tariff-card--featured">
                            <p className="home__tariff-name">{t.homeTariffCity}</p>
                            <PriceFigure value={cityFrom} lang={lang} from={t.homeTariffFrom} />
                            <p className="home__tariff-note">{t.homeTariffCityNote}</p>
                        </div>
                        <div className="home__tariff-card">
                            <p className="home__tariff-name">{t.homeTariffRegion}</p>
                            <PriceFigure value={districtFrom} lang={lang} from={t.homeTariffFrom} />
                            <p className="home__tariff-note">{t.homeTariffRegionNote}</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* ══ 6. FEATURES ROW ══ */}
            <section className="home__featrow">
                <div className="home__feat">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M5 14v-2.5a7 7 0 0 1 14 0V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        <rect x="3" y="13" width="4" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.5"/>
                        <rect x="17" y="13" width="4" height="6" rx="1.8" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M19 19v.5a2 2 0 0 1-2 2h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <div>
                        <p className="home__feat-title">{t.homeFeat1Title}</p>
                        <p className="home__feat-sub">{t.homeFeat1Sub}</p>
                    </div>
                </div>
                <div className="home__feat">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2l8 3.5v6c0 4.8-3.6 8.4-8 9.5-4.4-1.1-8-4.7-8-9.5v-6L12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                        <path d="M8.5 11.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <div>
                        <p className="home__feat-title">{t.homeFeat2Title}</p>
                        <p className="home__feat-sub">{t.homeFeat2Sub}</p>
                    </div>
                </div>
                <div className="home__feat">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M13 2L5 13h6l-1 9 9-12h-6l1-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                    </svg>
                    <div>
                        <p className="home__feat-title">{t.homeFeat3Title}</p>
                        <p className="home__feat-sub">{t.homeFeat3Sub}</p>
                    </div>
                </div>
                <div className="home__feat">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2l3 2.2 3.7.3.9 3.6 2.9 2.4-1.6 3.4 1.6 3.4-2.9 2.4-.9 3.6-3.7.3L12 22l-3-2.2-3.7-.3-.9-3.6-2.9-2.4 1.6-3.4-1.6-3.4 2.9-2.4.9-3.6 3.7-.3L12 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                    </svg>
                    <div>
                        <p className="home__feat-title">{t.homeFeat4Title}</p>
                        <p className="home__feat-sub">{t.homeFeat4Sub}</p>
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

            {/* ══ PRICE CALCULATOR ══ */}
            {calcOpen && <PriceCalculatorModal onClose={() => setCalcOpen(false)} />}

            {/* App-update control — lets installed-PWA users drop the cached
                build and pull the latest version. */}
            <div className="home__update-row">
                <UpdateAppButton />
            </div>
        </div>
    );
}
