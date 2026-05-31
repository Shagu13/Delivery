export interface Stop { city: string; district: string; address: string; }

export function mapUrl(city: string, district: string, address: string) {
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

export function buildYandexRouteUrl(stops: Stop[], origin?: string) {
    const pts = stops.map(s => encodeURIComponent(`${s.address}, ${s.district}, ${s.city}, Georgia`));
    const all = origin ? [encodeURIComponent(origin), ...pts] : pts;
    return `https://yandex.com/maps/?mode=routes&rtext=${all.join('~')}&rtt=auto`;
}

// Yandex Go deep-link: opens route in the Yandex Go app (falls back to web on desktop).
// On Android/iOS the browser hands off to the Yandex Go app automatically.
export function buildYandexGoRouteUrl(stops: Stop[], origin?: string) {
    const fmt = (s: Stop) => encodeURIComponent(`${s.address}, ${s.district}, ${s.city}, Georgia`);
    const dest = fmt(stops[stops.length - 1]);
    const midStops = origin ? stops.slice(0, -1) : stops.slice(1, -1);
    const waypoints = midStops.map(fmt);
    const origParam = origin ? encodeURIComponent(origin) : fmt(stops[0]);
    const allPts = [origParam, ...waypoints, dest];
    return `https://go.yandex/route?rtext=${allPts.join('~')}&rtt=auto`;
}
