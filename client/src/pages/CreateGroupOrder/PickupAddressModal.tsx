import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';

interface PickupAddress {
  city:     string;
  district: string;
  address:  string;
}

interface Props {
  open:     boolean;
  initial:  PickupAddress;
  onSave:   (addr: PickupAddress) => void;
  onClose:  () => void;
}

interface Errors {
  city?:    string;
  district?: string;
  address?: string;
}

export function PickupAddressModal({ open, initial, onSave, onClose }: Props) {
  const [city,     setCity]     = useState(initial.city);
  const [district, setDistrict] = useState(initial.district);
  const [address,  setAddress]  = useState(initial.address);
  const [errors,   setErrors]   = useState<Errors>({});

  useEffect(() => {
    if (open) {
      setCity(initial.city);
      setDistrict(initial.district);
      setAddress(initial.address);
      setErrors({});
    }
  }, [open, initial.city, initial.district, initial.address]);

  if (!open) return null;

  const validate = (): boolean => {
    const e: Errors = {};
    if (!city.trim())     e.city     = 'City is required.';
    if (!district.trim()) e.district = 'District is required.';
    if (!address.trim())  e.address  = 'Street address is required.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    onSave({ city: city.trim(), district: district.trim(), address: address.trim() });
  };

  return createPortal(
    <div className="pickup-modal-backdrop" onClick={onClose}>
      <div className="pickup-modal" role="dialog" aria-modal="true" aria-labelledby="pickup-modal-title" onClick={e => e.stopPropagation()}>
        <div className="pickup-modal__header">
          <h2 className="pickup-modal__title" id="pickup-modal-title">Different Pickup Address</h2>
          <button className="pickup-modal__close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="pickup-modal__body">
          <p className="pickup-modal__hint">
            Enter the pickup address you want to use for this order only. Your registered address will not be changed.
          </p>

          <CityDistrictPicker
            cityValue={city}
            districtValue={district}
            onCityChange={v => { setCity(v);     setErrors(e => ({ ...e, city: undefined })); }}
            onDistrictChange={v => { setDistrict(v); setErrors(e => ({ ...e, district: undefined })); }}
            cityError={errors.city}
            districtError={errors.district}
          />

          <FormField
            label="Street Address"
            required
            value={address}
            onChange={e => { setAddress(e.target.value); setErrors(prev => ({ ...prev, address: undefined })); }}
            error={errors.address}
            placeholder="e.g. 12 Rustaveli Avenue, Apt 4"
            maxLength={250}
          />
        </div>

        <div className="pickup-modal__footer">
          <button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" type="button" onClick={handleSave}>Use This Address</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
