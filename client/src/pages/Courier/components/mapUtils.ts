export interface Stop { city: string; district: string; address: string; }

export type GeocodeCache = Map<string, [number, number] | null>;

function cacheKey(s: Stop) {
    return `${s.address}, ${s.district}, ${s.city}, Georgia`.toLowerCase();
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
    if (!m || !cache) return stops;

    let curLat = parseFloat(m[1]);
    let curLon = parseFloat(m[2]);

    const remaining: { stop: Stop; lat: number; lon: number }[] = [];
    const ungeocoded: Stop[] = [];
    for (const s of stops) {
        const c = cache.get(cacheKey(s));
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
    const coords = cache?.get(cacheKey(s));
    if (coords) return `${coords[0]},${coords[1]}`;
    return encodeURIComponent(`${s.address}, ${s.district}, ${s.city}, Georgia`);
}

export function mapUrl(
    city: string,
    district: string,
    address: string,
    lat?: number | null,
    lon?: number | null,
) {
    // Prefer exact coordinates (captured from the geocoded address pick): Google
    // then drops a pin on the precise spot instead of fuzzy-matching the text —
    // no more "did you mean…". Fall back to the text address when no pin exists.
    if (lat != null && lon != null) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
    }
    const q = encodeURIComponent(`${address}, ${district}, ${city}, Georgia`);
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export function buildGoogleRouteUrl(stops: Stop[], origin?: string) {
    const dest = encodeURIComponent(`${stops[stops.length - 1].address}, ${stops[stops.length - 1].district}, ${stops[stops.length - 1].city}, Georgia`);
    const orig = origin ?? encodeURIComponent(`${stops[0].address}, ${stops[0].district}, ${stops[0].city}, Georgia`);
    const midStops = origin ? stops.slice(0, -1) : stops.slice(1, -1);
    const wps = midStops.map(s => encodeURIComponent(`${s.address}, ${s.district}, ${s.city}, Georgia`)).join('|');
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
