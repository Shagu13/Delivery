import { useState } from 'react';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import type { ValidationErrors } from '../../types/groupOrder';
import { useLanguage } from '../../contexts/useLanguage';

interface SenderData {
  senderFirstName:    string;
  senderLastName:     string;
  senderIdNumber?:    string;
  senderBusinessName: string;
  senderPhone:        string;
  alternativeSenderPhone: string;
  pickUpCity:         string;
  pickUpDistrict:     string;
  pickUpAddress:      string;
  note:               string;
}

interface SenderSectionProps {
  data:      SenderData;
  errors:    ValidationErrors;
  onChange:  (field: keyof SenderData, value: string) => void;
  /** When true shows a banner that fields were pre-filled from the customer profile. */
  prefilled?: boolean;
  /**
   * When true the customer wants to use a different pickup address for this order.
   * Pickup fields are shown as editable; when false they are locked to the registered address.
   */
  useOtherAddress?: boolean;
  onUseOtherAddressChange?: (checked: boolean) => void;
  /** Called when the user clicks "Use a different pickup address" button. */
  onOpenPickupModal?: () => void;
  /** The customer's main address plus their saved secondary addresses (capped at 5),
   *  offered as a quick pickup-location picker. First entry is always the main address. */
  addressOptions?: { id: string; label: string; city: string; district: string; address: string }[];
  /** id of the currently-selected saved option ('' when a one-off custom address is in use). */
  selectedAddressId?: string;
  onSelectAddress?: (id: string) => void;
}

export function SenderSection({
  data,
  errors,
  onChange,
  prefilled,
  useOtherAddress = false,
  onUseOtherAddressChange,
  onOpenPickupModal,
  addressOptions,
  selectedAddressId,
  onSelectAddress,
}: SenderSectionProps) {
  const { t } = useLanguage();
  const [showAltPhone, setShowAltPhone] = useState(!!data.alternativeSenderPhone);

  const clearAltPhone = () => {
    setShowAltPhone(false);
    onChange('alternativeSenderPhone', '');
  };

  return (
    <section className="form-section">
      <div className="form-section__body">
        {/* Personal Information — hidden when pre-filled from profile */}
        {!prefilled && <fieldset className="fieldset">
          <legend className="fieldset__legend">{t.cgoPersonalInfo}</legend>

          <div className="grid grid--2">
            <FormField
              label={t.cgoFirstName} required
              value={data.senderFirstName}
              onChange={e => onChange('senderFirstName', e.target.value)}
              error={errors.senderFirstName}
              placeholder="e.g. გიორგი" maxLength={100}
            />
            <FormField
              label={t.cgoLastName} required
              value={data.senderLastName}
              onChange={e => onChange('senderLastName', e.target.value)}
              error={errors.senderLastName}
              placeholder="e.g. ბერიძე" maxLength={100}
            />
          </div>

          <FormField
            label={t.cgoBusinessName} required
            value={data.senderBusinessName}
            onChange={e => onChange('senderBusinessName', e.target.value)}
            error={errors.senderBusinessName}
            placeholder={t.cgoBusinessPlaceholder}
            maxLength={150}
          />

          <div className="grid grid--2">
            <FormField
              label={t.cgoIdNumber}
              value={data.senderIdNumber ?? ''}
              onChange={e => onChange('senderIdNumber', e.target.value)}
              error={errors.senderIdNumber}
              placeholder={t.cgoIdPlaceholder}
              maxLength={50}
            />
            <FormField
              label={t.cgoPhone} required type="tel"
              value={data.senderPhone}
              onChange={e => onChange('senderPhone', e.target.value)}
              error={errors.senderPhone}
              placeholder="5XX XXX XXX" maxLength={9}
            />
          </div>
        </fieldset>}

        {/* Alternative mobile number — optional, revealed on demand */}
        <div className="alt-phone-block">
          {!showAltPhone ? (
            <button
              type="button"
              className="btn btn--ghost alt-phone-toggle"
              onClick={() => setShowAltPhone(true)}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              {t.cgoAltPhoneButton}
            </button>
          ) : (
            <div className="alt-phone-field">
              <FormField
                label={t.cgoAltPhone} type="tel"
                value={data.alternativeSenderPhone ?? ''}
                onChange={e => onChange('alternativeSenderPhone', e.target.value)}
                error={errors.alternativeSenderPhone}
                placeholder="5XX XXX XXX" maxLength={9}
              />
              <button
                type="button"
                className="alt-phone-remove"
                onClick={clearAltPhone}
                aria-label={t.cgoAltPhoneRemove}
              >
                {t.cgoAltPhoneRemove}
              </button>
            </div>
          )}
        </div>

        {/* Pickup Location */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{t.cgoPickupLocation}</legend>

          {prefilled && addressOptions && addressOptions.length > 1 && onSelectAddress && (
            <div className="addr-picker">
              <span className="form-field__label">{t.cgoAddrPickerLabel}</span>
              <div className="addr-tick-row">
                {addressOptions.map(opt => {
                  const active = selectedAddressId === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      className={`addr-tick-btn${active ? ' addr-tick-btn--active' : ''}`}
                      onClick={() => onSelectAddress(opt.id)}
                      aria-pressed={active}
                    >
                      <span className="addr-tick-circle">
                        {active && (
                          <svg width="10" height="10" viewBox="0 0 16 16" fill="none">
                            <path d="M3 8.5l3.5 3.5L13 4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="addr-tick-btn__text">
                        <span className="addr-tick-btn__label">{opt.label}</span>
                        <span className="addr-tick-btn__sub">{opt.city}, {opt.district}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {prefilled && onOpenPickupModal && (
            <div className="other-address-row">
              <button
                type="button"
                className="btn btn--ghost other-address-btn"
                onClick={onOpenPickupModal}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 6.5A1.5 1.5 0 1 1 8 4a1.5 1.5 0 0 1 0 3z" fill="currentColor" />
                </svg>
                {useOtherAddress ? t.cgoChangePickup : t.cgoDifferentPickup}
              </button>
              {useOtherAddress && onUseOtherAddressChange && (
                <button
                  type="button"
                  className="btn btn--ghost other-address-reset"
                  onClick={() => onUseOtherAddressChange(false)}
                >
                  {t.cgoResetAddress}
                </button>
              )}
            </div>
          )}

          <CityDistrictPicker
            cityValue={data.pickUpCity}
            districtValue={data.pickUpDistrict}
            onCityChange={cityName => {
              onChange('pickUpCity', cityName);
              onChange('pickUpDistrict', '');
            }}
            onDistrictChange={districtName => onChange('pickUpDistrict', districtName)}
            cityError={errors.pickUpCity}
            districtError={errors.pickUpDistrict}
            disabled={prefilled && !useOtherAddress}
          />

          <FormField
            label={t.cgoStreetAddress} required
            value={data.pickUpAddress}
            onChange={e => onChange('pickUpAddress', e.target.value)}
            error={errors.pickUpAddress}
            placeholder={t.cgoStreetPlaceholder} maxLength={250}
            disabled={prefilled && !useOtherAddress}
          />

          <FormField
            as="textarea"
            label={t.cgoNoteCourier}
            value={data.note}
            onChange={e => onChange('note', e.target.value)}
            error={errors.note}
            placeholder={t.cgoNotePlaceholder}
            rows={3} maxLength={500}
          />
        </fieldset>
      </div>
    </section>
  );
}

