import { useEffect, useRef, useState } from 'react';
import { fetchAddressSuggestions, type AddressSuggestion } from '../../api/address';

/**
 * Geoapify address autocomplete — self-contained feature module.
 *
 * The actual Geoapify API key lives on the .NET backend (config key
 * `Geoapify:ApiKey`); the browser only ever calls our own
 * `/api/address/autocomplete` proxy, so the key is never exposed.
 *
 * To remove the whole feature: delete the `features/addressAutocomplete/`
 * folder + `api/address.ts`, revert the <AddressAutocomplete> usages back to
 * <FormField>, and delete the backend AddressController / GetAddressSuggestions
 * query / GeoapifyAddressService.
 */
export type { AddressSuggestion } from '../../api/address';

interface Options {
  /** UI/result language: 'ka' for Georgian, 'en' for Latin. */
  lang?: string;
  /** JWT — the proxy endpoint requires authentication. */
  token?: string | null;
  minChars?: number;
  debounceMs?: number;
}

/**
 * Debounced address autocomplete via the backend proxy. Pass the current query
 * text; get back suggestions + a loading flag.
 */
export function useAddressAutocomplete(
  query: string,
  { lang = 'en', token, minChars = 3, debounceMs = 300 }: Options = {},
) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!token || trimmed.length < minChars) {
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
        const results = await fetchAddressSuggestions(trimmed, lang, token, controller.signal);
        setSuggestions(results);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setSuggestions([]);
        }
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [query, lang, token, minChars, debounceMs]);

  return { suggestions, loading };
}
