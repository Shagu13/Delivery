import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../../contexts/useLanguage';
import { mapUrl, mapUrlYandex, mapUrlYandexNavi } from './mapUtils';

interface Props {
    city: string;
    district: string;
    address: string;
    /** Exact coordinates from a geocoded pin, when available. */
    lat?: number | null;
    lon?: number | null;
}

// Clickable delivery/pickup address. Instead of opening Google Maps directly, it
// asks the courier which map app to open (Google Maps, Yandex Maps, Yandex Navi) —
// mirroring the multi-stop route toolbar's three choices. The menu renders in a
// portal so the courier card's `overflow: hidden` can't clip it.
export function AddressMapLink({ city, district, address, lat, lon }: Props) {
    const { t } = useLanguage();
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const reposition = () => {
        const r = btnRef.current?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };

    useEffect(() => {
        if (!open) return;
        reposition();
        const onDocClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (!btnRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        document.addEventListener('mousedown', onDocClick);
        return () => {
            window.removeEventListener('scroll', reposition, true);
            window.removeEventListener('resize', reposition);
            document.removeEventListener('mousedown', onDocClick);
        };
    }, [open]);

    const choices = [
        { label: t.rtGoogleMaps, url: mapUrl(city, district, address, lat, lon) },
        { label: t.rtYandexMaps, url: mapUrlYandex(city, district, address, lat, lon) },
        { label: t.rtYandexNavi, url: mapUrlYandexNavi(city, district, address, lat, lon) },
    ];

    const openMap = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
        setOpen(false);
    };

    return (
        <>
            <button
                ref={btnRef}
                type="button"
                className="courier-card__map-link"
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={() => setOpen(o => !o)}
            >
                📍 {address}
            </button>
            {open && createPortal(
                <div
                    ref={menuRef}
                    className="address-map-link__menu"
                    role="menu"
                    style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: Math.max(pos.width, 180) }}
                >
                    <div className="address-map-link__heading">{t.cdChooseMap}</div>
                    {choices.map(c => (
                        <button
                            key={c.label}
                            type="button"
                            role="menuitem"
                            className="address-map-link__item"
                            onClick={() => openMap(c.url)}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>,
                document.body,
            )}
        </>
    );
}
