import { useLanguage } from '../../contexts/useLanguage';
import './contact.css';

// ── Exact pin coordinates for კოსმონავტების სანაპირო 25ა, Tbilisi ──────────
const LAT = 41.73448943770577;
const LNG = 44.776115992151134;

// OpenStreetMap embed — no API key needed, pin placed manually
const MAP_SRC =
    `https://www.google.com/maps?q=${LAT},${LNG}&output=embed`;

const DIRECTIONS_URL =
    `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`;

export function ContactPage() {
    const { lang } = useLanguage();

    const t = {
        en: {
            hero: 'Contact Us',
            sub: 'We are here to help. Reach out to us by phone or visit our office.',
            branch: 'Tbilisi Office',
            address: 'Kosmonavtebis Sanapiro 25a, Tbilisi',
            phone: '595 304 000',
            hours: 'Mon – Fri: 10:00 – 19:00',
            hoursSat: 'Sat: 10:00 – 14:00',
            callUs: 'Call us',
            whatsapp: 'WhatsApp',
            getDirections: 'Get directions',
            followUs: 'Follow us',
        },
        ka: {
            hero: 'კონტაქტი',
            sub: 'ჩვენ მზად ვართ დაგეხმაროთ. დაგვიკავშირდით ტელეფონით ან ეწვიეთ ჩვენს ოფისს.',
            branch: 'თბილისის ოფისი',
            address: 'კოსმონავტების სანაპირო 25ა, თბილისი',
            phone: '595 304 000',
            hours: 'ორშ – პარ: 10:00 – 19:00',
            hoursSat: 'შაბ: 10:00 – 14:00',
            callUs: 'დარეკვა',
            whatsapp: 'WhatsApp',
            getDirections: 'მარშრუტი',
            followUs: 'გამოგვყევით',
        },
    }[lang];

    return (
        <div className="contact">
            {/* ── Hero ── */}
            <section className="contact__hero">
                <h1 className="contact__hero-title">{t.hero}</h1>
                <p className="contact__hero-sub">{t.sub}</p>
            </section>

            {/* ── Map + Card layout ── */}
            <section className="contact__body">
                {/* Info card */}
                <div className="contact__card">
                    <div className="contact__card-icon">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                                fill="var(--color-accent)" />
                            <circle cx="12" cy="9" r="2.5" fill="white" />
                        </svg>
                    </div>

                    <h2 className="contact__branch-name">{t.branch}</h2>

                    <div className="contact__info-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="contact__row-icon">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                                stroke="var(--color-text-muted)" strokeWidth="1.8" fill="none" />
                            <circle cx="12" cy="9" r="2" stroke="var(--color-text-muted)" strokeWidth="1.8" />
                        </svg>
                        <span>{t.address}</span>
                    </div>

                    <div className="contact__info-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="contact__row-icon">
                            <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1v3.5a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z"
                                stroke="var(--color-text-muted)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span>{t.phone}</span>
                    </div>

                    <div className="contact__info-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="contact__row-icon">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="var(--color-text-muted)"/>
                            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.985-1.309A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="var(--color-text-muted)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>595 304 000</span>
                    </div>

                    <div className="contact__info-row">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="contact__row-icon">
                            <circle cx="12" cy="12" r="9" stroke="var(--color-text-muted)" strokeWidth="1.8" />
                            <path d="M12 7v5l3 3" stroke="var(--color-text-muted)" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                        <span>{t.hours}</span>
                    </div>

                    <div className="contact__info-row contact__info-row--indent">
                        <span className="contact__row-icon" />
                        <span>{t.hoursSat}</span>
                    </div>

                    {/* Action buttons */}
                    <div className="contact__actions">
                        <a
                            href="tel:+995595304000"
                            className="contact__btn contact__btn--primary"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24 11.47 11.47 0 003.58.57 1 1 0 011 1v3.5a1 1 0 01-1 1A17 17 0 013 5a1 1 0 011-1h3.5a1 1 0 011 1 11.47 11.47 0 00.57 3.58 1 1 0 01-.25 1.01l-2.2 2.2z"
                                    stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {t.callUs}
                        </a>
                        <a
                            href="https://wa.me/995595304000"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="contact__btn contact__btn--whatsapp"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor"/>
                                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.985-1.309A9.953 9.953 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {t.whatsapp}
                        </a>
                        <a
                            href={DIRECTIONS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="contact__btn contact__btn--secondary"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6-3V7m6 16l4.553-2.276A1 1 0 0021 19.382V8.618a1 1 0 00-.553-.894L15 5m0 15V5M9 7l6-2"
                                    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            {t.getDirections}
                        </a>
                    </div>

                    {/* Social links */}
                    <div className="contact__social">
                        <span className="contact__social-label">{t.followUs}</span>
                        <div className="contact__social-icons">
                            <a
                                className="contact__social-link"
                                href="https://www.instagram.com/dilodeliverygeo?igsh=aTV3amdvM3dham9j"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Instagram"
                            >
                                <svg width="38" height="38" viewBox="0 0 24 24">
                                    <defs>
                                        <linearGradient id="igGradContact" x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
                                            <stop offset="0" stopColor="#FEDA75"/>
                                            <stop offset="0.25" stopColor="#FA7E1E"/>
                                            <stop offset="0.5" stopColor="#D62976"/>
                                            <stop offset="0.75" stopColor="#962FBF"/>
                                            <stop offset="1" stopColor="#4F5BD5"/>
                                        </linearGradient>
                                    </defs>
                                    <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igGradContact)"/>
                                    <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="1.7"/>
                                    <circle cx="17.2" cy="6.8" r="1.25" fill="#fff"/>
                                </svg>
                            </a>
                            <a
                                className="contact__social-link"
                                href="https://www.facebook.com/share/1E7uXrB8Hp/?mibextid=wwXIfr"
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="Facebook"
                            >
                                <svg width="38" height="38" viewBox="0 0 24 24">
                                    <rect x="2" y="2" width="20" height="20" rx="6" fill="#1877F2"/>
                                    <path d="M13.5 21v-7h2.3l.35-2.7H13.5V9.55c0-.78.22-1.31 1.34-1.31h1.43V5.82c-.25-.03-1.1-.11-2.08-.11-2.06 0-3.47 1.26-3.47 3.56v1.99H8.5V14h2.22v7h2.78z" fill="#fff"/>
                                </svg>
                            </a>
                        </div>
                    </div>
                </div>

                {/* Map embed — OpenStreetMap, no API key */}
                <div className="contact__map-wrap">
                    <iframe
                        title="Dilo Office Location"
                        className="contact__map"
                        loading="lazy"
                        src={MAP_SRC}
                    />
                </div>
            </section>
        </div>
    );
}
