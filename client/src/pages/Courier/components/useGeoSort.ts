import { useState, useEffect, useRef, useCallback } from 'react';

export type SortMode = 'district' | 'nearest';

export interface GeoSortState {
    sortMode: SortMode;
    setSortMode: (m: SortMode | ((prev: SortMode) => SortMode)) => void;
    locState: 'idle' | 'locating' | 'ready' | 'denied';
    coords: GeolocationCoordinates | null;
    geocodeCache: Map<string, [number, number] | null>;
    geocoding: boolean;
    retryLocation: () => void;
    refreshLocation: () => void;
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Geocoded coordinates are stable per address, so we persist successful lookups
// to localStorage. On the next dashboard visit they're already cached, so the
// list pre-sorts instantly instead of re-geocoding every address from scratch.
const GEO_CACHE_KEY = 'delivery_geocode_cache_v1';

function loadPersistedCache(): Map<string, [number, number] | null> {
    try {
        const raw = localStorage.getItem(GEO_CACHE_KEY);
        if (!raw) return new Map();
        const obj = JSON.parse(raw) as Record<string, [number, number]>;
        return new Map(Object.entries(obj));
    } catch {
        return new Map();
    }
}

// Persist only successful (non-null) results — a transient geocode failure must
// not be cached forever; it should be retried on the next visit.
function persistCache() {
    try {
        const obj: Record<string, [number, number]> = {};
        for (const [k, v] of globalGeocodeCache) if (v) obj[k] = v;
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(obj));
    } catch {
        /* storage unavailable / quota exceeded — keep the in-memory cache only */
    }
}

// One global cache shared across both panels, seeded from localStorage.
const globalGeocodeCache = loadPersistedCache();

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
        if (result) persistCache();
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
    const watchIdRef = useRef<number | null>(null);

    // Continuously track the courier's location so "nearest" sorting and routes
    // always reflect where the courier currently is, not where they were on load.
    // Exposed as retryLocation so a denied/failed permission can be re-requested.
    const startWatch = useCallback(() => {
        if (!navigator.geolocation) { setLocState('idle'); return; }
        if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
        setLocState('locating');
        let firstFix = true;
        watchIdRef.current = navigator.geolocation.watchPosition(
            pos => {
                setCoords(pos.coords);
                setLocState('ready');
                // Auto-switch to nearest only on the first fix, so a courier who
                // manually flips back to district isn't overridden on the next update.
                if (firstFix) { setSortMode('nearest'); firstFix = false; }
            },
            () => setLocState('denied'),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
        );
    }, []);

    useEffect(() => {
        startWatch();
        return () => { if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current); };
    }, [startWatch]);

    // Silent one-shot refresh: forces a fresh fix and updates coords without the
    // "locating" flicker. Used after a courier finishes a stop so the re-sort and
    // next route reflect exactly where they are now. A transient failure is
    // ignored — the continuous watch keeps the last good fix and surfaces denials.
    const refreshLocation = useCallback(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            pos => { setCoords(pos.coords); setLocState('ready'); },
            () => { /* keep the last known fix */ },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
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

    return { sortMode, setSortMode, locState, coords, geocodeCache, geocoding, retryLocation: startWatch, refreshLocation };
}

/** Best-effort coordinates for an address from the shared geocode cache (null if never geocoded). */
export function lookupGeocode(address: string, district: string, city: string): [number, number] | null {
    const key = `${address}, ${district}, ${city}, Georgia`.toLowerCase();
    return globalGeocodeCache.get(key) ?? null;
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
