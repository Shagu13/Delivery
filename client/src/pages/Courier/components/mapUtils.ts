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
