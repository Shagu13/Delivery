import { useState, useEffect } from 'react';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { fetchCities, fetchDistricts } from '../../api/cities';
import type { City, District } from '../../api/cities';
import type { OrderItemRequest, ValidationErrors } from '../../types/groupOrder';

interface PackageCardProps {
  index: number;
  data: OrderItemRequest;
  errors: ValidationErrors;
  canRemove: boolean;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean) => void;
  onRemove: (index: number) => void;
}

export function PackageCard({
  index,
  data,
  errors,
  canRemove,
  onChange,
  onRemove,
}: PackageCardProps) {
  const fieldError = (field: string) => errors[`orders[${index}].${field}`];

  // ── City list + sub-district list for in-city mode ──────────────────────────
  const [cityList,     setCityList]     = useState<City[]>([]);
  const [subDistricts, setSubDistricts] = useState<District[]>([]);
  const [subLoading,   setSubLoading]   = useState(false);

  // Load cities once so we can resolve cityId → city name
  useEffect(() => {
    fetchCities().then(setCityList).catch(() => {});
  }, []);

  // When in-city mode is active and city changes, load that city's districts
  // for the 3rd picker (filtering out the "city-itself" entry).
  useEffect(() => {
    if (!data.isDeliveryAddressInCityItself || !data.recipientCity) {
      setSubDistricts([]);
      return;
    }
    const city = cityList.find(c => c.cityName === data.recipientCity);
    if (!city) return;
    setSubLoading(true);
    fetchDistricts(city.id)
      .then(districts =>
        // Exclude the "city == district" entry so the user can't pick it again
        setSubDistricts(districts.filter(d => d.districtName !== data.recipientCity))
      )
      .catch(() => setSubDistricts([]))
      .finally(() => setSubLoading(false));
  }, [data.isDeliveryAddressInCityItself, data.recipientCity, cityList]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCityChange = (cityName: string) => {
    onChange(index, 'recipientCity', cityName);
    onChange(index, 'recipientDistrict', '');
    onChange(index, 'isDeliveryAddressInCityItself', false);
  };

  const handleDistrictChange = (districtName: string) => {
    if (districtName && districtName === data.recipientCity) {
      // User selected the "city = district" option → trigger in-city mode
      onChange(index, 'isDeliveryAddressInCityItself', true);
      onChange(index, 'recipientDistrict', ''); // will be filled by 3rd picker
    } else {
      onChange(index, 'isDeliveryAddressInCityItself', false);
      onChange(index, 'recipientDistrict', districtName);
    }
  };

  return (
    <div className="package-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="package-card__header">
        <div className="package-card__badge">
          <span className="package-card__badge-label">Package</span>
          <span className="package-card__badge-num">{String(index + 1).padStart(2, '0')}</span>
        </div>
        {canRemove && (
          <button
            type="button"
            className="package-card__remove"
            onClick={() => onRemove(index)}
            aria-label={`Remove package ${index + 1}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Remove
          </button>
        )}
      </div>

      <div className="package-card__body">
        {/* Recipient */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Recipient</legend>
          <div className="grid grid--2">
            <FormField
              label="First Name"
              required
              value={data.recipientFirstName}
              onChange={e => onChange(index, 'recipientFirstName', e.target.value)}
              error={fieldError('recipientFirstName')}
              placeholder="e.g. Anna"
              maxLength={100}
            />
            <FormField
              label="Last Name"
              required
              value={data.recipientLastName}
              onChange={e => onChange(index, 'recipientLastName', e.target.value)}
              error={fieldError('recipientLastName')}
              placeholder="e.g. Johnson"
              maxLength={100}
            />
          </div>
          <FormField
            label="Phone Number"
            required
            type="tel"
            value={data.recipientPhone}
            onChange={e => onChange(index, 'recipientPhone', e.target.value)}
            error={fieldError('recipientPhone')}
            placeholder="5XX XXX XXX"
            maxLength={9}
          />
        </fieldset>

        {/* Delivery Address */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Delivery Address</legend>

          {/*
            Step 1 + 2: City and District.
            When the user picks District === City (e.g. "Tbilisi" / "Tbilisi"),
            handleDistrictChange sets isDeliveryAddressInCityItself=true and clears recipientDistrict.
            The picker's districtValue shows the city name to reflect the selection.
          */}
          <CityDistrictPicker
            cityValue={data.recipientCity}
            districtValue={
              data.isDeliveryAddressInCityItself
                ? data.recipientCity   // show city name as selected "district"
                : data.recipientDistrict
            }
            onCityChange={handleCityChange}
            onDistrictChange={handleDistrictChange}
            cityError={fieldError('recipientCity')}
            // Only show district error here when NOT in in-city mode
            // (in-city mode shows its own error on the sub-district picker below)
            districtError={data.isDeliveryAddressInCityItself ? undefined : fieldError('recipientDistrict')}
          />

          {/* Step 3 — Sub-district within the city (only shown in in-city mode) */}
          {data.isDeliveryAddressInCityItself && (
            <div className={`form-field${fieldError('recipientDistrict') ? ' form-field--error' : ''}`}>
              <label className="form-field__label">
                Sub-district within {data.recipientCity}
                <span className="form-field__required"> *</span>
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  className="form-field__input"
                  value={data.recipientDistrict}
                  disabled={subLoading}
                  onChange={e => onChange(index, 'recipientDistrict', e.target.value)}
                >
                  <option value="">
                    {subLoading ? 'Loading…' : `Select sub-district in ${data.recipientCity}…`}
                  </option>
                  {subDistricts.map(d => (
                    <option key={d.id} value={d.districtName}>
                      {d.districtName}
                    </option>
                  ))}
                </select>
              </div>
              {fieldError('recipientDistrict') && (
                <span className="form-field__error">{fieldError('recipientDistrict')}</span>
              )}
            </div>
          )}

          <FormField
            label="Street Address"
            required
            value={data.recipientAddress}
            onChange={e => onChange(index, 'recipientAddress', e.target.value)}
            error={fieldError('recipientAddress')}
            placeholder="e.g. 5 Rustaveli St, Floor 3"
            maxLength={250}
          />
          <FormField
            as="textarea"
            label="Package Description"
            value={data.description ?? ''}
            onChange={e => onChange(index, 'description', e.target.value)}
            error={fieldError('description')}
            placeholder="Contents, special handling…"
            rows={2}
            maxLength={500}
          />
        </fieldset>

        {/* Package Options */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Package Options</legend>

          {/* Payment & service fee */}
          <div className="grid grid--2">
            <div className="form-field">
              <label className="form-field__label">
                Payment Status <span className="form-field__required">*</span>
              </label>
              <select
                className="form-field__input"
                value={data.productPaymentStatus}
                onChange={e => onChange(index, 'productPaymentStatus', e.target.value)}
              >
                <option value="NotPaid">Not Paid</option>
                <option value="Paid">Paid</option>
              </select>
            </div>

            <div className="form-field">
              <label className="form-field__label">
                Who Pays Courier Fee <span className="form-field__required">*</span>
              </label>
              <select
                className="form-field__input"
                value={data.whoPaysForCompanyService}
                onChange={e => onChange(index, 'whoPaysForCompanyService', e.target.value)}
              >
                <option value="Sender">Sender</option>
                <option value="Recipient">Recipient</option>
              </select>
            </div>
          </div>

          {/* Fragile toggle */}
          <label className="package-card__fragile-toggle">
            <input
              type="checkbox"
              checked={data.isFragile}
              onChange={e => onChange(index, 'isFragile', e.target.checked)}
            />
            <span className="package-card__fragile-icon" aria-hidden="true">⚠</span>
            <span>
              <strong>Fragile</strong> — contains glass or easily breakable items
            </span>
          </label>
          {fieldError('isFragile') && (
            <p className="form-field__error">{fieldError('isFragile')}</p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
