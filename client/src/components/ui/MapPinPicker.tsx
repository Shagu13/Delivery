import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { useLanguage } from '../../contexts/useLanguage';
import { forwardGeocode, reverseGeocode } from '../../utils/geocoding';
import './Modal.css';
import './MapPinPicker.css';

// Vite rewrites the bundled marker image URLs; Leaflet's default icon otherwise 404s.
const pinIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface PickResult {
  lat: number;
  lon: number;
  address: string;
  /** Raw locality names from the reverse geocode, for the caller to match against its
   *  own city/district reference data. */
  city: string;
  district: string;
}

interface Props {
  open: boolean;
  /** The city / district the customer already selected — used to centre the map when
   *  there is no existing pin. */
  city: string;
  district: string;
  initialLat?: number | null;
  initialLon?: number | null;
  onClose: () => void;
  onPick: (result: PickResult) => void;
}

const TBILISI: [number, number] = [41.7151, 44.8271];

/**
 * Map modal for dropping / relocating an address pin. Renders a Leaflet map on
 * OpenStreetMap tiles, centres on the chosen city/district (or the existing pin), and reverse-geocodes
 * the point via Nominatim. Confirming returns the coordinates plus a best-effort street
 * address.
 */
export function MapPinPicker({ open, city, district, initialLat, initialLon, onClose, onPick }: Props) {
  const { t, lang } = useLanguage();
  const mapElRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [resolving, setResolving] = useState(false);
  const [picked, setPicked] = useState<PickResult | null>(null);

  useEffect(() => {
    if (!open || !mapElRef.current) return;
    let cancelled = false;
    setStatus('loading');
    setPicked(null);

    const hasPin = initialLat != null && initialLon != null;

    const map = L.map(mapElRef.current, { center: TBILISI, zoom: 12, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // The modal animates in; re-measure once layout settles so tiles fill the box.
    const sizeTimer = setTimeout(() => map.invalidateSize(), 250);

    function placePin(lat: number, lon: number) {
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lon]);
      } else {
        const m = L.marker([lat, lon], { draggable: true, icon: pinIcon }).addTo(map);
        m.on('dragend', () => {
          const p = m.getLatLng();
          void resolvePoint(p.lat, p.lng);
        });
        markerRef.current = m;
      }
    }

    async function resolvePoint(lat: number, lon: number) {
      placePin(lat, lon);
      setResolving(true);
      const r = await reverseGeocode(lat, lon, lang);
      if (!cancelled) { setPicked(r); setResolving(false); }
    }

    map.on('click', (e: L.LeafletMouseEvent) => { void resolvePoint(e.latlng.lat, e.latlng.lng); });

    (async () => {
      let center: [number, number] = TBILISI;
      let zoom = 12;
      if (hasPin) {
        center = [initialLat!, initialLon!];
        zoom = 17;
      } else {
        // Try "<district>, <city>, Georgia" first, then fall back to just the city.
        const queries = [
          district.trim() && `${district}, ${city}, Georgia`,
          city.trim() && `${city}, Georgia`,
        ].filter(Boolean) as string[];
        for (const q of queries) {
          const hit = await forwardGeocode(q, lang);
          if (cancelled) return;
          if (hit) {
            center = [hit.lat, hit.lon];
            zoom = q.startsWith(district) && district.trim() ? 16 : 13;
            break;
          }
        }
      }
      if (cancelled) return;
      map.setView(center, zoom);
      map.invalidateSize();
      setStatus('ready');
      if (hasPin) void resolvePoint(center[0], center[1]);
    })().catch(() => { if (!cancelled) setStatus('error'); });

    return () => {
      cancelled = true;
      clearTimeout(sizeTimer);
      map.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Portalled to <body> so the fixed overlay isn't trapped by an ancestor with a
  // `transform` (e.g. the register card's entrance animation) — that would clip the footer.
  return createPortal(
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal ui-modal--map" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.mapPinModalTitle}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="map-pin__body">
          <p className="map-pin__hint">{t.mapPinModalHint}</p>
          <div className="map-pin__canvas">
            <div ref={mapElRef} className="map-pin__map" />
            {status === 'loading' && <div className="map-pin__overlay">{t.mapPinLoading}</div>}
            {status === 'error'   && <div className="map-pin__overlay map-pin__overlay--error">{t.mapPinError}</div>}
          </div>
          <div className="map-pin__result">
            {resolving
              ? <span className="map-pin__result-text map-pin__result-text--muted">{t.mapPinResolving}</span>
              : picked
                ? <span className="map-pin__result-text">{picked.address || t.mapPinNoAddress}</span>
                : <span className="map-pin__result-text map-pin__result-text--muted">{t.mapPinNoPoint}</span>}
          </div>
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose}>{t.cancel}</button>
          <button
            className="ui-modal__btn ui-modal__btn--primary"
            disabled={!picked || resolving}
            onClick={() => { if (picked) { onPick(picked); onClose(); } }}
          >
            {t.mapPinUse}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
