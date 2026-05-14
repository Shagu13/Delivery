import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import type { OrderItemRequest, ValidationErrors } from '../../types/groupOrder';

interface PackageCardProps {
  index: number;
  data: OrderItemRequest;
  errors: ValidationErrors;
  canRemove: boolean;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => void;
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

  // Whether the COD collection amount field should be shown
  const showCollectAmount =
    data.productPaymentStatus === 'NotPaid' &&
    data.whoPaysForCompanyService === 'Recipient';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCityChange = (cityName: string) => {
    onChange(index, 'recipientCity', cityName);
    onChange(index, 'recipientDistrict', '');
  };

  const handleDistrictChange = (districtName: string) => {
    onChange(index, 'recipientDistrict', districtName);
  };

  const handlePaymentStatusChange = (value: string) => {
    onChange(index, 'productPaymentStatus', value);
    // Clear amount when conditions no longer apply
    if (value !== 'NotPaid') {
      onChange(index, 'amountToCollectForPackage', 0);
    }
  };

  const handleServicePayerChange = (value: string) => {
    onChange(index, 'whoPaysForCompanyService', value);
    // Clear amount when conditions no longer apply
    if (value !== 'Recipient') {
      onChange(index, 'amountToCollectForPackage', 0);
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
            City and District pickers. Selecting a city clears the district.
          */}
          <CityDistrictPicker
            cityValue={data.recipientCity}
            districtValue={data.recipientDistrict}
            onCityChange={handleCityChange}
            onDistrictChange={handleDistrictChange}
            cityError={fieldError('recipientCity')}
            districtError={fieldError('recipientDistrict')}
          />

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
                onChange={e => handlePaymentStatusChange(e.target.value)}
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
                onChange={e => handleServicePayerChange(e.target.value)}
              >
                <option value="Sender">Sender</option>
                <option value="Recipient">Recipient</option>
              </select>
            </div>
          </div>

          {/* COD collection amount — only shown when recipient pays and product is not pre-paid */}
          {showCollectAmount && (
            <div className="form-field">
              <label className="form-field__label">
                Amount to Collect from Recipient (₾){' '}
                <span className="form-field__required">*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="form-field__input"
                value={data.amountToCollectForPackage ?? ''}
                onChange={e => {
                  const val = parseFloat(e.target.value);
                  onChange(index, 'amountToCollectForPackage', isNaN(val) ? 0 : val);
                }}
                placeholder="e.g. 45.00"
              />
              <p className="form-field__hint" style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                💰 The courier will collect this amount + the courier fee from the recipient upon delivery.
              </p>
              {fieldError('amountToCollectForPackage') && (
                <p className="form-field__error">{fieldError('amountToCollectForPackage')}</p>
              )}
            </div>
          )}

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
