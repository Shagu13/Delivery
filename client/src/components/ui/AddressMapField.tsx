import { useEffect, useState } from 'react';
import { FormField } from './FormField';
import { MapPinPicker } from './MapPinPicker';
import { fetchCities, fetchDistricts } from '../../api/cities';
import type { City } from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';
import './MapPinPicker.css';

interface Props {
  label: string;
  placeholder?: string;
  required?: boolean;
  addressValue: string;
  onAddressChange: (value: string) => void;
  addressError?: string;
  /** Selected city / district names — the map button is disabled until both are set. */
  city: string;
  district: string;
  lat: number | null;
  lon: number | null;
  onPinChange: (lat: number | null, lon: number | null) => void;
  /** When supplied, dropping the pin in a different city/district updates them too
   *  (matched against the app's city reference data). */
  onCityChange?: (cityName: string) => void;
  onDistrictChange?: (districtName: string) => void;
}

const norm = (s?: string) => (s ?? '').trim().toLowerCase();

/**
 * Street-address field with a "set on map" button. The button unlocks once a city and
 * district are chosen; opening it centres an OpenStreetMap map on that area, and dropping
 * the pin fills the address text + stores the coordinates. When the pin lands in a
 * different city, the city/district selectors are re-pointed to match (best effort).
 */
export function AddressMapField({
  label, placeholder, required, addressValue, onAddressChange, addressError,
  city, district, lat, lon, onPinChange, onCityChange, onDistrictChange,
}: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);

  // Needed only when the parent opted into city/district sync, but the list is tiny and
  // fetching it unconditionally keeps the effect deps stable.
  useEffect(() => {
    let alive = true;
    fetchCities().then(c => { if (alive) setCities(c); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const canPin = !!city.trim() && !!district.trim();
  const hasPin = lat != null && lon != null;

  const handlePick = async (r: { lat: number; lon: number; address: string; city: string; district: string }) => {
    // Resolve a matching reference city/district BEFORE touching parent state, so the
    // final `onPinChange` (which re-sets the pin the city change would clear) runs in
    // the same synchronous batch.
    let nextCity = '';
    let nextDistrict = '';
    let changeLocation = false;

    if (onCityChange && r.city) {
      const mc = cities.find(c => norm(c.cityName) === norm(r.city) || norm(c.cityNameGeo) === norm(r.city));
      if (mc && norm(mc.cityName) !== norm(city)) {
        changeLocation = true;
        nextCity = mc.cityName;
        try {
          const ds = await fetchDistricts(mc.id);
          const md = ds.find(d => norm(d.districtName) === norm(r.district) || norm(d.districtNameGeo) === norm(r.district));
          nextDistrict = md ? md.districtName : '';
        } catch {
          nextDistrict = '';
        }
      }
    }

    if (r.address) onAddressChange(r.address);
    if (changeLocation) {
      onCityChange?.(nextCity);
      onDistrictChange?.(nextDistrict);
    }
    onPinChange(r.lat, r.lon);
  };

  return (
    <div className="address-map-field">
      <FormField
        label={label}
        required={required}
        value={addressValue}
        onChange={e => onAddressChange(e.target.value)}
        error={addressError}
        placeholder={placeholder}
        maxLength={250}
      />

      <button
        type="button"
        className="address-map-field__btn"
        disabled={!canPin}
        onClick={() => setOpen(true)}
      >
        📍 {hasPin ? t.mapPinEdit : t.mapPin}
      </button>
      {!canPin && <span className="address-map-field__note">{t.mapPinHintCityFirst}</span>}
      {canPin && hasPin && <span className="address-map-field__note address-map-field__note--set">{t.mapPinSet}</span>}

      {open && (
        <MapPinPicker
          open={open}
          city={city}
          district={district}
          initialLat={lat}
          initialLon={lon}
          onClose={() => setOpen(false)}
          onPick={r => { void handlePick(r); }}
        />
      )}
    </div>
  );
}
