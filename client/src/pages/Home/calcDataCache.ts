import { fetchAllDistrictsFlat, type AllDistrictEntry } from '../../api/cities';
import { fetchWeightPriceTiers, type WeightPriceTier } from '../../api/weightPriceTiers';

// ── Module-level data cache (TTL: 5 minutes) ─────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000;

export let _cachedDistricts: AllDistrictEntry[] | null = null;
export let _cachedTiers: WeightPriceTier[] | null = null;
let _cacheTime: number | null = null;
let _fetchPromise: Promise<void> | null = null;

export function isCacheValid(): boolean {
  return !!(_cachedDistricts && _cachedTiers && _cacheTime != null && Date.now() - _cacheTime < CACHE_TTL_MS);
}

export function prefetchCalcData(): Promise<void> {
  if (isCacheValid()) return Promise.resolve();
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = Promise.all([fetchAllDistrictsFlat(), fetchWeightPriceTiers()])
    .then(([districts, tiers]) => {
      _cachedDistricts = districts;
      _cachedTiers = tiers;
      _cacheTime = Date.now();
      _fetchPromise = null; // allow a fresh fetch after next TTL expiry
    })
    .catch(() => { _fetchPromise = null; });
  return _fetchPromise;
}
