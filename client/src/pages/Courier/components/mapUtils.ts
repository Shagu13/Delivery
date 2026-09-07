export interface Stop {
    city: string;
    district: string;
    address: string;
    /** Exact coordinates from a geocoded address pick; used in preference to the text. */
    lat?: number | null;
    lon?: number | null;
}

export type GeocodeCache = Map<string, [number, number] | null>;

function cacheKey(s: Stop) {
    return `${s.address}, ${s.district}, ${s.city}, Georgia`.toLowerCase();
}

// A stop's best-known coordinates: the exact pin captured at order time wins;
// otherwise fall back to whatever the text-geocoder cached.
function stopCoords(s: Stop, cache?: GeocodeCache): [number, number] | null {
    if (s.lat != null && s.lon != null) return [s.lat, s.lon];
    return cache?.get(cacheKey(s)) ?? null;
}

// A route point for text-based map deep-links: exact "lat,lon" when known,
// else the URL-encoded text address.
function routePoint(s: Stop, cache?: GeocodeCache): string {
    const c = stopCoords(s, cache);
    if (c) return `${c[0]},${c[1]}`;
    return encodeURIComponent(`${s.address}, ${s.district}, ${s.city}, Georgia`);
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

// The map apps visit waypoints in the order the URL lists them — none of the
// free deep-links support server-side route optimization. So we order the stops
// ourselves: a greedy nearest-neighbour chain starting from the courier's
// location, using the coordinates we already geocoded. Stops we couldn't geocode
// keep their original order and go last.
export function orderStopsByNearest(stops: Stop[], origin?: string, cache?: GeocodeCache): Stop[] {
    const m = origin?.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) return stops;

    let curLat = parseFloat(m[1]);
    let curLon = parseFloat(m[2]);

    const remaining: { stop: Stop; lat: number; lon: number }[] = [];
    const ungeocoded: Stop[] = [];
    for (const s of stops) {
        const c = stopCoords(s, cache);
        if (c) remaining.push({ stop: s, lat: c[0], lon: c[1] });
        else ungeocoded.push(s);
    }

    const ordered: Stop[] = [];
    while (remaining.length) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
            const d = haversineKm(curLat, curLon, remaining[i].lat, remaining[i].lon);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        const [next] = remaining.splice(bestIdx, 1);
        ordered.push(next.stop);
        curLat = next.lat;
        curLon = next.lon;
    }
    return [...ordered, ...ungeocoded];
}

function yandexPoint(s: Stop, cache?: GeocodeCache): string {
    return routePoint(s, cache);
}

// Single-destination map links moved to a shared util so the admin "view on map"
// buttons can reuse them. Re-exported here under their original names so this
// module's existing consumers (AddressMapLink) don't change.
export {
    googleMapsUrl as mapUrl,
    yandexMapsUrl as mapUrlYandex,
    yandexNaviUrl as mapUrlYandexNavi,
} from '../../../utils/mapLinks';

export function buildGoogleRouteUrl(stops: Stop[], origin?: string, cache?: GeocodeCache) {
    const dest = routePoint(stops[stops.length - 1], cache);
    const orig = origin ?? routePoint(stops[0], cache);
    const midStops = origin ? stops.slice(0, -1) : stops.slice(1, -1);
    const wps = midStops.map(s => routePoint(s, cache)).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}${wps ? `&waypoints=${wps}` : ''}&travelmode=driving`;
}

export function buildYandexRouteUrl(stops: Stop[], origin?: string, cache?: GeocodeCache) {
    const pts = stops.map(s => yandexPoint(s, cache));
    const all = origin ? [encodeURIComponent(origin), ...pts] : pts;
    return `https://yandex.com/maps/?mode=routes&rtext=${all.join('~')}&rtt=auto`;
}

// Yandex Navi deep-link: opens route in the Yandex Navigator app (falls back to web on desktop).
export function buildYandexNaviRouteUrl(stops: Stop[], origin?: string, cache?: GeocodeCache) {
    const pts = stops.map(s => yandexPoint(s, cache));
    const all = origin ? [encodeURIComponent(origin), ...pts] : pts;
    return `https://yandex.com/navi/?rtext=${all.join('~')}&rtt=auto`;
}
