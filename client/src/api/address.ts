import { withAuth } from '../contexts/useAuth';

export interface AddressSuggestion {
  /** Full human-readable address, e.g. "Rustaveli Avenue 7, Tbilisi". */
  formatted: string;
  /** First line only (street + house number). */
  addressLine1?: string;
  /** Remainder (city, region), shown as muted secondary text. */
  addressLine2?: string;
  lat?: number;
  lon?: number;
}

/**
 * Fetches address suggestions from our own backend, which proxies the request
 * to the geocoding provider with a server-side API key. The key never reaches
 * the browser.
 */
export async function fetchAddressSuggestions(
  text: string,
  lang: string,
  token: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const url = `/api/address/autocomplete?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(lang)}`;
  const res = await fetch(url, { ...withAuth(token), method: 'GET', signal });
  if (!res.ok) throw new Error('Failed to fetch address suggestions');
  return res.json();
}
