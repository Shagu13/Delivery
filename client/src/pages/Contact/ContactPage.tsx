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
            getDirections: 'Get directions',
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
            getDirections: 'მარშრუტი',
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
