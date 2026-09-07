import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/useLanguage';
import { googleMapsUrl, yandexMapsUrl } from '../../utils/mapLinks';
import './ViewOnMapButton.css';

interface Props {
  city: string;
  district: string;
  address: string;
  /** Exact coordinates from a saved pin; when absent the links fall back to a text search. */
  lat?: number | null;
  lon?: number | null;
  /** Icon-only rendering for dense tables. */
  compact?: boolean;
}

/**
 * Read-only "view on map" control for admin tables. Opens a small menu letting the admin
 * pick Google Maps or Yandex Maps; each opens in a new tab, dropping a pin on the exact
 * coordinates when a pin was saved, otherwise searching the text address.
 */
export function ViewOnMapButton({ city, district, address, lat, lon, compact = false }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: Math.max(8, r.right - 168) });
    };
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

  const hasPin = lat != null && lon != null;
  const choices = [
    { label: t.viewMapGoogle, url: googleMapsUrl(city, district, address, lat, lon) },
    { label: t.viewMapYandex, url: yandexMapsUrl(city, district, address, lat, lon) },
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
        className={`vom-btn${compact ? ' vom-btn--compact' : ''}${hasPin ? ' vom-btn--pinned' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={hasPin ? t.viewMapTitlePinned : t.viewMapTitleApprox}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
      >
        📍{compact ? '' : ` ${t.viewMapLabel}`}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          className="vom-menu"
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left }}
        >
          <div className="vom-menu__heading">{hasPin ? t.viewMapHeadingPinned : t.viewMapHeadingApprox}</div>
          {choices.map(c => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              className="vom-menu__item"
              onClick={e => { e.stopPropagation(); openMap(c.url); }}
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
