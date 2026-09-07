// Forward / reverse geocoding via OpenStreetMap Nominatim (no API key).
//
// Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
//  - at most 1 request/second — enforced by the queue below
//  - a valid Referer or User-Agent identifying the app — the browser sends Referer
//  - no autocomplete-style bulk querying — we only geocode on map open + pin drop

const BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1100;

let lastCall = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Serialises calls and spaces them ≥1.1s apart to respect the Nominatim rate limit. */
function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall = Date.now();
    return fn();
  };
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

export interface GeocodePoint {
  lat: number;
  lon: number;
  /** Best-effort street-level address ("Rustaveli Ave 12"), may be empty. */
  address: string;
  /** Raw locality name from the geocoder (Tbilisi / Gori / …), may be empty. */
  city: string;
  /** Raw sub-locality / district name from the geocoder (Vake / …), may be empty. */
  district: string;
}

interface NominatimAddress {
  road?: string;
  house_number?: string;
  pedestrian?: string;
  neighbourhood?: string;
  suburb?: string;
  quarter?: string;
  borough?: string;
  city_district?: string;
  district?: string;
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  country?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name?: string;
  address?: NominatimAddress;
}

function streetLine(r: NominatimResult): string {
  const a = r.address ?? {};
  const street = a.road ?? a.pedestrian ?? a.neighbourhood ?? '';
  const line = [street, a.house_number].filter(Boolean).join(' ').trim();
  if (line) return line;
  if (a.suburb) return a.suburb;
  // Fall back to the full label without the country segment.
  const full = r.display_name ?? '';
  return full.split(',').slice(0, 2).join(',').trim();
}

function cityName(a: NominatimAddress): string {
  return (a.city ?? a.town ?? a.municipality ?? a.village ?? '').trim();
}

function districtName(a: NominatimAddress): string {
  return (a.city_district ?? a.district ?? a.borough ?? a.suburb ?? a.quarter ?? '').trim();
}

const langHeader = (lang: 'en' | 'ka') => (lang === 'ka' ? 'ka,en' : 'en');

/** Reverse-geocode a coordinate to a street address. Never throws — returns an empty
 *  address string on failure. */
export function reverseGeocode(lat: number, lon: number, lang: 'en' | 'ka'): Promise<GeocodePoint> {
  return throttle(async () => {
    try {
      const url = `${BASE}/reverse?format=jsonv2&zoom=18&addressdetails=1`
        + `&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
        + `&accept-language=${encodeURIComponent(langHeader(lang))}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return { lat, lon, address: '', city: '', district: '' };
      const data = (await res.json()) as NominatimResult;
      const a = data.address ?? {};
      return { lat, lon, address: streetLine(data), city: cityName(a), district: districtName(a) };
    } catch {
      return { lat, lon, address: '', city: '', district: '' };
    }
  });
}

/** Forward-geocode free text (e.g. "Gori, Georgia") to a coordinate. Returns null on
 *  failure or no match. */
export function forwardGeocode(query: string, lang: 'en' | 'ka'): Promise<{ lat: number; lon: number } | null> {
  return throttle(async () => {
    try {
      const url = `${BASE}/search?format=jsonv2&limit=1&countrycodes=ge`
        + `&q=${encodeURIComponent(query)}`
        + `&accept-language=${encodeURIComponent(langHeader(lang))}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      const data = (await res.json()) as NominatimResult[];
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    } catch {
      return null;
    }
  });
}
