import { useState, useEffect, useRef } from 'react';

export type SortMode = 'district' | 'nearest';

export interface GeoSortState {
    sortMode: SortMode;
    setSortMode: (m: SortMode | ((prev: SortMode) => SortMode)) => void;
    locState: 'idle' | 'locating' | 'ready' | 'denied';
    coords: GeolocationCoordinates | null;
    geocodeCache: Map<string, [number, number] | null>;
    geocoding: boolean;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// One global in-memory cache shared across both panels for the page lifetime.
const globalGeocodeCache = new Map<string, [number, number] | null>();

async function nominatimGeocode(address: string, district: string, city: string): Promise<[number, number] | null> {
    const query = `${address}, ${district}, ${city}, Georgia`;
    const key = query.toLowerCase();
    if (globalGeocodeCache.has(key)) return globalGeocodeCache.get(key)!;

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
    try {
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        const data: { lat: string; lon: string }[] = await res.json();
        const result = data.length > 0 ? ([parseFloat(data[0].lat), parseFloat(data[0].lon)] as [number, number]) : null;
        globalGeocodeCache.set(key, result);
        return result;
    } catch {
        globalGeocodeCache.set(key, null);
        return null;
    }
}

export function useGeoSort(addresses: { address: string; district: string; city: string }[]): GeoSortState {
    const [sortMode, setSortMode] = useState<SortMode>('district');
    const [locState, setLocState] = useState<'idle' | 'locating' | 'ready' | 'denied'>(() =>
        typeof navigator !== 'undefined' && navigator.geolocation ? 'locating' : 'idle'
    );
    const [coords, setCoords] = useState<GeolocationCoordinates | null>(null);
    const [geocodeCache, setGeocodeCache] = useState<Map<string, [number, number] | null>>(new Map(globalGeocodeCache));
    const [geocoding, setGeocoding] = useState(false);
    const geocodingRef = useRef(false);

    // Get courier location once on mount
    useEffect(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            pos => { setCoords(pos.coords); setLocState('ready'); setSortMode('nearest'); },
            () => setLocState('denied'),
            { timeout: 8000 }
        );
    }, []);

    // Geocode addresses when location is available and we switch to nearest mode
    useEffect(() => {
        if (!coords || addresses.length === 0) return;

        const missing = addresses.filter(a => {
            const key = `${a.address}, ${a.district}, ${a.city}, Georgia`.toLowerCase();
            return !globalGeocodeCache.has(key);
        });
        if (missing.length === 0) return;
        if (geocodingRef.current) return;

        geocodingRef.current = true;
        setGeocoding(true);

        // Nominatim requires max 1 req/sec — chain them sequentially with a delay
        const runSequential = async () => {
            for (const a of missing) {
                await nominatimGeocode(a.address, a.district, a.city);
                // snapshot the growing cache into state after each result
                setGeocodeCache(new Map(globalGeocodeCache));
                await new Promise(r => setTimeout(r, 1100)); // respect Nominatim 1 req/s
            }
            geocodingRef.current = false;
            setGeocoding(false);
        };

        runSequential();
    }, [coords, addresses]);

    return { sortMode, setSortMode, locState, coords, geocodeCache, geocoding };
}

export function distanceToAddress(
    coords: GeolocationCoordinates,
    address: string,
    district: string,
    city: string,
    cache: Map<string, [number, number] | null>
): number {
    const key = `${address}, ${district}, ${city}, Georgia`.toLowerCase();
    const center = cache.get(key);
    if (!center) return Infinity;
    return haversineKm(coords.latitude, coords.longitude, center[0], center[1]);
}
