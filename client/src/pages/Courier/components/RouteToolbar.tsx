import { useState } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import type { Stop, GeocodeCache } from './mapUtils';
import { buildGoogleRouteUrl, buildYandexRouteUrl, buildYandexNaviRouteUrl } from './mapUtils';

interface RouteToolbarProps { stops: Stop[]; onClear: () => void; geocodeCache?: GeocodeCache; }

export function RouteToolbar({ stops, onClear, geocodeCache }: RouteToolbarProps) {
    const { t } = useLanguage();
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
            <span className="route-toolbar__count">{t.rtStops(stops.length)}</span>
            {locState === 'idle' && (
                <button onClick={requestLocation} className="route-toolbar__btn route-toolbar__btn--loc">
                    {t.rtUseLocation}
                </button>
            )}
            {locState === 'loading' && <span className="route-toolbar__count">{t.rtLocating}</span>}
            {locState === 'denied'  && <span className="route-toolbar__count" style={{ color: '#f97316' }}>{t.rtLocDenied}</span>}
            {locState === 'ready'   && <span className="route-toolbar__count" style={{ color: '#10b981' }}>{t.rtLocSet}</span>}
            <a href={buildGoogleRouteUrl(stops, currentLoc)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--google">
                {t.rtGoogleMaps}
            </a>
            <a href={buildYandexRouteUrl(stops, currentLoc, geocodeCache)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandex">
                {t.rtYandexMaps}
            </a>
            <a href={buildYandexNaviRouteUrl(stops, currentLoc, geocodeCache)} target="_blank" rel="noopener noreferrer" className="route-toolbar__btn route-toolbar__btn--yandexgo">
                {t.rtYandexNavi}
            </a>
            <button onClick={onClear} className="route-toolbar__clear">✕</button>
        </div>
    );
}
