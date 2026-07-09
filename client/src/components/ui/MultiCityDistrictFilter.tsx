import { useMemo } from 'react';
import { useLanguage } from '../../contexts/useLanguage';
import { LocationMultiPicker } from './LocationMultiPicker';

// A distinct city+district pair an admin can filter by. Mirrors OrderLocation/
// GroupOrderLocation shapes so callers can pass either straight through.
export interface CityDistrictOption {
  city: string;
  cityGeo?: string | null;
  district: string;
  districtGeo?: string | null;
}

// Cascading multi-select city/district filter: pick any number of cities, then (once at
// least one city is picked) any number of districts within them. AND semantics — a location
// matches when its city is selected (or no city selected) AND its district is selected (or no
// district selected). Reused across the Packages and Finance admin pages for a consistent feel.
export function MultiCityDistrictFilter({
  options, cities, districts, onCitiesChange, onDistrictsChange, locCity, locDistrict, disabled,
}: {
  options: CityDistrictOption[];
  cities: string[];
  districts: string[];
  onCitiesChange: (values: string[]) => void;
  onDistrictsChange: (values: string[]) => void;
  locCity: (en: string, geo?: string | null) => string;
  locDistrict: (en: string, geo?: string | null) => string;
  disabled?: boolean;
}) {
  const { t } = useLanguage();

  const availableCities = useMemo(() => [...new Set(options.map(o => o.city))].sort(), [options]);

  const cityGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    options.forEach(o => { if (o.cityGeo) map[o.city] = o.cityGeo; });
    return map;
  }, [options]);

  const districtGeoMap = useMemo(() => {
    const map: Record<string, string | undefined> = {};
    options.forEach(o => { if (o.districtGeo) map[o.district] = o.districtGeo; });
    return map;
  }, [options]);

  const availableDistricts = useMemo(() => {
    if (cities.length === 0) return [];
    return [...new Set(options.filter(o => cities.includes(o.city)).map(o => o.district))].sort();
  }, [options, cities]);

  // Picking a different set of cities invalidates whatever districts were narrowed within
  // the previous set (mirrors the Packages page's cascading behaviour).
  const handleCitiesChange = (next: string[]) => { onCitiesChange(next); onDistrictsChange([]); };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
      <div className="go-filter-step">
        <span className="go-step-label">{t.goCity}</span>
        <LocationMultiPicker available={availableCities} selected={cities} onChange={handleCitiesChange}
          geoMap={cityGeoMap} locLabel={locCity} allLabel={t.goAllCities} disabled={disabled || availableCities.length === 0} />
      </div>
      {cities.length > 0 && (
        <>
          <svg className="go-chain-arrow" width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginBottom: 6 }}>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div className="go-filter-step">
            <span className="go-step-label">{t.goDistrict}</span>
            <LocationMultiPicker available={availableDistricts} selected={districts} onChange={onDistrictsChange}
              geoMap={districtGeoMap} locLabel={locDistrict} allLabel={t.goAllDistricts} disabled={availableDistricts.length === 0} />
          </div>
        </>
      )}
    </div>
  );
}
