// Single-destination deep links to consumer map apps. Prefer exact coordinates (from a
// geocoded pin) so the app drops a precise marker instead of fuzzy-matching the text;
// fall back to a text address search when no pin exists.
//
// Shared by the courier AddressMapLink and the admin "view on map" buttons.

function textQuery(city: string, district: string, address: string): string {
  return [address, district, city, 'Georgia'].filter(Boolean).join(', ');
}

/** Google Maps — search / pin view. */
export function googleMapsUrl(
  city: string, district: string, address: string,
  lat?: number | null, lon?: number | null,
): string {
  if (lat != null && lon != null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(textQuery(city, district, address))}`;
}

/** Yandex Maps — search / pin view (Yandex uses lon,lat order for ll/pt). */
export function yandexMapsUrl(
  city: string, district: string, address: string,
  lat?: number | null, lon?: number | null,
): string {
  if (lat != null && lon != null) {
    return `https://yandex.com/maps/?ll=${lon},${lat}&z=17&pt=${lon},${lat}`;
  }
  return `https://yandex.com/maps/?mode=search&text=${encodeURIComponent(textQuery(city, district, address))}`;
}

/** Yandex Navigator — driving route from the current location to the destination. */
export function yandexNaviUrl(
  city: string, district: string, address: string,
  lat?: number | null, lon?: number | null,
): string {
  const dest = lat != null && lon != null
    ? `${lat},${lon}`
    : encodeURIComponent(textQuery(city, district, address));
  return `https://yandex.com/navi/?rtext=~${dest}&rtt=auto`;
}
