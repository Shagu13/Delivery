import { useState } from 'react';
import type { Stop } from './mapUtils';
import { buildGoogleRouteUrl, buildYandexRouteUrl, buildYandexNaviRouteUrl } from './mapUtils';

interface RouteToolbarProps { stops: Stop[]; onClear: () => void; }

export function RouteToolbar({ stops, onClear }: RouteToolbarProps) {
    const [locState, setLocState] = useState<'idle' | 'loading' | 'ready' | 'denied'>('idle');
    const [currentLoc, setCurrentLoc] = useState<string | undefined>(undefined);

    if (stops.length < 2) return null;

    const requestLocation = () => {
        if (!navigator.geolocation) { setLocState('denied'); return; }
        setLocState('loading');
        navigator.geolocation.getCurrentPosition(
            pos => {
                setCurrentLoc(`${pos.coords.latitude},${pos.coords.longitude}`);
                setLocState('ready');
            },
            () => setLocState('denied'),
            { timeout: 8000 }
        );
    };

    return (
        <div className="route-toolbar">
            <span className="route-toolbar__count">{stops.length} stops</span>
            {locState === 'idle' && (
                <button onClick={requestLocation} className="route-toolbar__btn route-toolbar__btn--loc">
                    📍 Use my location
                </button>
            )}
            {locState === 'loading' && <span className="route-toolbar__count">Locating…</span>}
            {locState === 'denied'  && <span className="route-toolbar__count" style={{ color: '#f97316' }}>Location denied</span>}
            {locState === 'ready'   && <span className="route-toolbar__count" style={{ color: '#10b981' }}>📍 Location set</span>}
            <a href={buildGoogleRouteUrl(stops, currentLoc)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--google">
                🗺 Google Maps
            </a>
            <a href={buildYandexRouteUrl(stops, currentLoc)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandex">
                🗺 Yandex Maps
            </a>
            <a href={buildYandexNaviRouteUrl(stops, currentLoc)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandexgo">
                🧭 Yandex Navi
            </a>
            <button onClick={onClear} className="route-toolbar__clear">✕</button>
        </div>
    );
}
