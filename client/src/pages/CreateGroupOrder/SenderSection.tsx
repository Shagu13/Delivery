import { FormField } from '../../components/ui/FormField';
import type { ValidationErrors } from '../../types/groupOrder';

interface SenderData {
  senderFirstName:    string;
  senderLastName:     string;
  senderIdNumber?:    string;
  senderBusinessName: string;
  senderPhone:        string;
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
}

export function SenderSection({
  data,
  errors,
  onChange,
  prefilled,
  useOtherAddress = false,
  onUseOtherAddressChange,
}: SenderSectionProps) {
  return (
    <section className="form-section">
      <div className="form-section__header">
        <span className="form-section__number">01</span>
        <div>
          <h2 className="form-section__title">Sender Details</h2>
          <p className="form-section__desc">Your personal information and pickup location</p>
        </div>
      </div>

      {prefilled && (
        <div className="prefill-banner" role="status">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          Pre-filled from your saved profile — you can still edit any field below.
        </div>
      )}

      <div className="form-section__body">
        {/* Personal Information */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Personal Information</legend>

          <div className="grid grid--2">
            <FormField
              label="First Name" required
              value={data.senderFirstName}
              onChange={e => onChange('senderFirstName', e.target.value)}
              error={errors.senderFirstName}
              placeholder="e.g. John" maxLength={100}
            />
            <FormField
              label="Last Name" required
              value={data.senderLastName}
              onChange={e => onChange('senderLastName', e.target.value)}
              error={errors.senderLastName}
              placeholder="e.g. Smith" maxLength={100}
            />
          </div>

          <FormField
            label="Business / Page Name" required
            value={data.senderBusinessName}
            onChange={e => onChange('senderBusinessName', e.target.value)}
            error={errors.senderBusinessName}
            placeholder="e.g. My Online Shop, Nike Georgia, Gadget Store GE"
            maxLength={150}
          />

          <div className="grid grid--2">
            <FormField
              label="ID Number"
              value={data.senderIdNumber ?? ''}
              onChange={e => onChange('senderIdNumber', e.target.value)}
              error={errors.senderIdNumber}
              placeholder="National ID / Passport (optional)"
              maxLength={50}
            />
            <FormField
              label="Phone Number" required type="tel"
              value={data.senderPhone}
              onChange={e => onChange('senderPhone', e.target.value)}
              error={errors.senderPhone}
              placeholder="5XX XXX XXX" maxLength={9}
            />
          </div>
        </fieldset>

        {/* Pickup Location */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">Pickup Location</legend>

          {/* Use Other Address toggle (only shown when profile was pre-filled) */}
          {prefilled && onUseOtherAddressChange && (
            <label className="other-address-toggle">
              <input
                type="checkbox"
                checked={useOtherAddress}
                onChange={e => onUseOtherAddressChange(e.target.checked)}
              />
              <span>Use a different pickup address for this order</span>
            </label>
          )}

          {/* Pickup fields — always shown; locked to registered address unless toggle is on */}
          <div className="grid grid--2">
            <FormField
              label="City" required
              value={data.pickUpCity}
              onChange={e => onChange('pickUpCity', e.target.value)}
              error={errors.pickUpCity}
              placeholder="e.g. Tbilisi" maxLength={100}
              disabled={prefilled && !useOtherAddress}
            />
            <FormField
              label="District" required
              value={data.pickUpDistrict}
              onChange={e => onChange('pickUpDistrict', e.target.value)}
              error={errors.pickUpDistrict}
              placeholder="e.g. Vake" maxLength={100}
              disabled={prefilled && !useOtherAddress}
            />
          </div>

          <FormField
            label="Street Address" required
            value={data.pickUpAddress}
            onChange={e => onChange('pickUpAddress', e.target.value)}
            error={errors.pickUpAddress}
            placeholder="e.g. 12 Rustaveli Avenue, Apt 4" maxLength={250}
            disabled={prefilled && !useOtherAddress}
          />

          <FormField
            as="textarea"
            label="Note for Courier"
            value={data.note}
            onChange={e => onChange('note', e.target.value)}
            error={errors.note}
            placeholder="Any special instructions for pickup…"
            rows={3} maxLength={500}
          />
        </fieldset>
      </div>
    </section>
  );
}
