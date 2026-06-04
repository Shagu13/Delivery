import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import type { Stop, GeocodeCache } from './mapUtils';
import { buildGoogleRouteUrl, buildYandexRouteUrl, buildYandexNaviRouteUrl, orderStopsByNearest } from './mapUtils';

interface RouteToolbarProps { stops: Stop[]; onClear: () => void; geocodeCache?: GeocodeCache; coords?: GeolocationCoordinates | null; }

export function RouteToolbar({ stops, onClear, geocodeCache, coords }: RouteToolbarProps) {
    const { t } = useLanguage();
    const [locState, setLocState] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle');
    const [manualLoc, setManualLoc] = useState<string | undefined>(undefined);

    // Prefer the continuously-tracked courier location; fall back to a manual
    // one-shot request only when tracking isn't available (denied/unsupported).
    const origin = coords ? `${coords.latitude},${coords.longitude}` : manualLoc;

    // With a known origin we can route to a single stop; otherwise we need at
    // least two stops to form origin → destination.
    if (origin ? stops.length < 1 : stops.length < 2) return null;

    // Reorder the selected stops closest-first from the courier's location so the
    // map app opens with an already-optimised route.
    const routeStops = orderStopsByNearest(stops, origin, geocodeCache);

    const requestLocation = () => {
        if (!navigator.geolocation) { setLocState('denied'); return; }
        setLocState('loading');
        navigator.geolocation.getCurrentPosition(
            pos => {
                setManualLoc(`${pos.coords.latitude},${pos.coords.longitude}`);
                setLocState('ready');
            },
            () => setLocState('denied'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <div className="route-toolbar">
            <span className="route-toolbar__count">{t.rtStops(stops.length)}</span>
            {coords ? (
                <span className="route-toolbar__count" style={{ color: '#10b981' }}>{t.rtLocSet}</span>
            ) : (
                <>
                    {locState === 'idle' && (
                        <button onClick={requestLocation} className="route-toolbar__btn route-toolbar__btn--loc">
                            {t.rtUseLocation}
                        </button>
                    )}
                    {locState === 'loading' && <span className="route-toolbar__count">{t.rtLocating}</span>}
                    {locState === 'denied'  && <span className="route-toolbar__count" style={{ color: '#f97316' }}>{t.rtLocDenied}</span>}
                    {locState === 'ready'   && <span className="route-toolbar__count" style={{ color: '#10b981' }}>{t.rtLocSet}</span>}
                </>
            )}
            <a href={buildGoogleRouteUrl(routeStops, origin)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--google">
                {t.rtGoogleMaps}
            </a>
            <a href={buildYandexRouteUrl(routeStops, origin, geocodeCache)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandex">
                {t.rtYandexMaps}
            </a>
            <a href={buildYandexNaviRouteUrl(routeStops, origin, geocodeCache)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandexgo">
                {t.rtYandexNavi}
            </a>
            <button onClick={onClear} className="route-toolbar__clear">✕</button>
        </div>
    );
}
