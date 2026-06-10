import { useEffect, useRef, useState } from 'react';

/**
 * Geoapify address autocomplete — self-contained feature module.
 * To remove the whole feature: delete the `features/addressAutocomplete/`
 * folder and revert the <AddressAutocomplete> usages back to <FormField>.
 *
 * The API key is read from the Vite env var `VITE_GEOAPIFY_API_KEY`
 * (put it in `client/.env.local`). If the key is absent the component
 * silently degrades to a plain text input — nothing else breaks.
 */
const API_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;
const ENDPOINT = 'https://api.geoapify.com/v1/geocode/autocomplete';

/** True when an API key is configured; lets the UI degrade gracefully. */
export const ADDRESS_AUTOCOMPLETE_ENABLED = Boolean(API_KEY);

export interface AddressSuggestion {
  /** Full human-readable address, e.g. "Rustaveli Avenue 7, Tbilisi". */
  formatted: string;
  /** First line only (street + house number), useful as a compact label. */
  addressLine1?: string;
  /** Remainder (city, region) shown as muted secondary text. */
  addressLine2?: string;
  lat?: number;
  lon?: number;
}

interface Options {
  /** UI/result language: 'ka' for Georgian, 'en' for Latin. */
  lang?: string;
  minChars?: number;
  debounceMs?: number;
}

interface GeoapifyResult {
  formatted: string;
  address_line1?: string;
  address_line2?: string;
  lat?: number;
  lon?: number;
}

/**
 * Debounced Geoapify autocomplete. Pass the current query text; get back
 * suggestions + a loading flag. Results are biased to Georgia (countrycode:ge).
 */
export function useAddressAutocomplete(
  query: string,
  { lang = 'en', minChars = 3, debounceMs = 300 }: Options = {},
) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!API_KEY || trimmed.length < minChars) {
      abortRef.current?.abort();
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const handle = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const url =
          `${ENDPOINT}?text=${encodeURIComponent(trimmed)}` +
          `&apiKey=${API_KEY}` +
          '&filter=countrycode:ge' +
          `&lang=${encodeURIComponent(lang)}` +
          '&limit=6&format=json';
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`Geoapify ${res.status}`);
        const data: { results?: GeoapifyResult[] } = await res.json();
        setSuggestions(
          (data.results ?? []).map(r => ({
            formatted: r.formatted,
            addressLine1: r.address_line1,
            addressLine2: r.address_line2,
            lat: r.lat,
            lon: r.lon,
          })),
        );
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [query, lang, minChars, debounceMs]);

  return { suggestions, loading };
}
