import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/useLanguage';
import { fetchAllDistrictsFlat, type AllDistrictEntry } from '../api/cities';

// City/district names are stored on orders as plain strings (either the English or the
// Georgian form, depending on how they were entered). To render them in the chosen language
// we load the flat city/district list once and map any known name → its {en, geo} pair.
// Module-level cache so every consumer shares one fetch.
let _cache: AllDistrictEntry[] | null = null;
let _inflight: Promise<AllDistrictEntry[]> | null = null;

function loadEntries(): Promise<AllDistrictEntry[]> {
    if (_cache) return Promise.resolve(_cache);
    if (!_inflight) {
        _inflight = fetchAllDistrictsFlat()
            .then(d => { _cache = d; return d; })
            .catch(() => { _inflight = null; return []; });
    }
    return _inflight;
}

interface NamePair { en: string; geo?: string }

/**
 * Returns `locCity` / `locDistrict` helpers that translate a stored city/district name into
 * the active language. Unknown names (not in the city list) are returned unchanged.
 */
export function usePlaceLocalizer() {
    const { lang } = useLanguage();
    const [entries, setEntries] = useState<AllDistrictEntry[]>(_cache ?? []);

    useEffect(() => {
        if (_cache) { setEntries(_cache); return; }
        let alive = true;
        loadEntries().then(e => { if (alive) setEntries(e); });
        return () => { alive = false; };
    }, []);

    const { cityMap, districtMap } = useMemo(() => {
        const cityMap = new Map<string, NamePair>();
        const districtMap = new Map<string, NamePair>();
        for (const e of entries) {
            const cityPair: NamePair = { en: e.cityName, geo: e.cityNameGeo };
            if (e.cityName) cityMap.set(e.cityName, cityPair);
            if (e.cityNameGeo) cityMap.set(e.cityNameGeo, cityPair);
            const distPair: NamePair = { en: e.districtName, geo: e.districtNameGeo };
            if (e.districtName) districtMap.set(e.districtName, distPair);
            if (e.districtNameGeo) districtMap.set(e.districtNameGeo, distPair);
        }
        return { cityMap, districtMap };
    }, [entries]);

    const pick = (pair: NamePair | undefined, fallback: string) =>
        pair ? (lang === 'ka' ? (pair.geo || pair.en) : pair.en) : fallback;

    const locCity     = (name: string | null | undefined) => name ? pick(cityMap.get(name), name) : '';
    const locDistrict = (name: string | null | undefined) => name ? pick(districtMap.get(name), name) : '';

    return { locCity, locDistrict };
}
