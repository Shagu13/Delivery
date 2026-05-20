import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import type { District } from '../../api/cities';
import type { OrderItemRequest, ValidationErrors } from '../../types/groupOrder';
import { useLanguage } from '../../contexts/useLanguage';

interface CustomerPricing {
  companyServiceCapitalPrice:  number | null;
  companyServiceCityPrice:     number | null;
  companyServiceDistrictPrice: number | null;
}

interface PackageCardProps {
  index: number;
  data: OrderItemRequest;
  errors: ValidationErrors;
  canRemove: boolean;
  customerPricing?: CustomerPricing | null;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => void;
  onRemove: (index: number) => void;
}

export function PackageCard({
  index,
  data,
  errors,
  canRemove,
  customerPricing,
  onChange,
  onRemove,
}: PackageCardProps) {
  const { t } = useLanguage();
  const fieldError = (field: string) => errors[`orders[${index}].${field}`];

  // ── Helpers ────────────────────────────────────────────────────────────────
  /** Compute company service fee from customer pricing tiers or district default. */
  const computeServiceFee = (district: District): number => {
    if (customerPricing) {
      if (district.isCapitalTerritory && (customerPricing.companyServiceCapitalPrice ?? 0) > 0)
        return customerPricing.companyServiceCapitalPrice!;
      if (district.isCityTerritory && (customerPricing.companyServiceCityPrice ?? 0) > 0)
        return customerPricing.companyServiceCityPrice!;
      if ((customerPricing.companyServiceDistrictPrice ?? 0) > 0)
        return customerPricing.companyServiceDistrictPrice!;
    }
    return district.companyServicePrice ?? 0;
  };

  // Whether the parcel price / service fee fields should be shown — any NotPaid order
  const showCollectAmount = data.productPaymentStatus === 'NotPaid';

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleCityChange = (cityName: string) => {
    onChange(index, 'recipientCity', cityName);
    onChange(index, 'recipientDistrict', '');
  };

  const handleDistrictChange = (districtName: string) => {
    onChange(index, 'recipientDistrict', districtName);
  };

  const handleDistrictSelect = (district: District | null) => {
    if (district) {
      const fee = computeServiceFee(district);
      onChange(index, 'companyServicePrice', fee);
    } else {
      onChange(index, 'companyServicePrice', 0);
    }
  };

  const handlePaymentStatusChange = (value: string) => {
    onChange(index, 'productPaymentStatus', value);
    if (value === 'NotPaid') {
      // Auto-select Recipient as the service payer when parcel is not pre-paid
      onChange(index, 'whoPaysForCompanyService', 'Recipient');
    } else {
      // Clear amount when no longer NotPaid
      onChange(index, 'amountToCollectForPackage', 0);
    }
  };

  const handleServicePayerChange = (value: string) => {
    onChange(index, 'whoPaysForCompanyService', value);
  };

  return (
    <div className="package-card" style={{ animationDelay: `${index * 60}ms` }}>
      <div className="package-card__header">
        <div className="package-card__badge">
          <span className="package-card__badge-label">{t.cgoPackageLabel}</span>
          <span className="package-card__badge-num">{String(index + 1).padStart(2, '0')}</span>
        </div>
        {canRemove && (
          <button
            type="button"
            className="package-card__remove"
            onClick={() => onRemove(index)}
            aria-label={`${t.cgoRemove} ${index + 1}`}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t.cgoRemove}
          </button>
        )}
      </div>

      <div className="package-card__body">
        {/* Recipient */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{t.cgoRecipient}</legend>
          <div className="grid grid--2">
            <FormField
              label={t.cgoRecipientFirstName}
              value={data.recipientFirstName}
              onChange={e => onChange(index, 'recipientFirstName', e.target.value)}
              error={fieldError('recipientFirstName')}
              placeholder={t.cgoRecipientFNPlaceholder}
              maxLength={100}
            />
            <FormField
              label={t.cgoRecipientLastName}
              value={data.recipientLastName}
              onChange={e => onChange(index, 'recipientLastName', e.target.value)}
              error={fieldError('recipientLastName')}
              placeholder={t.cgoRecipientLNPlaceholder}
              maxLength={100}
            />
          </div>
          <FormField
            label={t.cgoRecipientPhone}
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
          <legend className="fieldset__legend">{t.cgoDeliveryAddress}</legend>

          <CityDistrictPicker
            cityValue={data.recipientCity}
            districtValue={data.recipientDistrict}
            onCityChange={handleCityChange}
            onDistrictChange={handleDistrictChange}
            onDistrictSelect={handleDistrictSelect}
            cityError={fieldError('recipientCity')}
            districtError={fieldError('recipientDistrict')}
          />

          <FormField
            label={t.cgoStreetAddress}
            required
            value={data.recipientAddress}
            onChange={e => onChange(index, 'recipientAddress', e.target.value)}
            error={fieldError('recipientAddress')}
            placeholder={t.cgoStreetPlaceholder}
            maxLength={250}
          />
          <FormField
            as="textarea"
            label={t.cgoPackageDescription}
            value={data.description ?? ''}
            onChange={e => onChange(index, 'description', e.target.value)}
            error={fieldError('description')}
            placeholder={t.cgoDescPlaceholder}
            rows={2}
            maxLength={500}
          />
        </fieldset>

        {/* Package Options */}
        <fieldset className="fieldset">
          <legend className="fieldset__legend">{t.cgoPackageOptions}</legend>

          {/* Payment & service fee */}
          <div className="grid grid--2">
            <div className="form-field">
              <label className="form-field__label">
                {t.cgoPaymentStatus} <span className="form-field__required">*</span>
              </label>
              <select
                className="form-field__input"
                value={data.productPaymentStatus}
                onChange={e => handlePaymentStatusChange(e.target.value)}
              >
                <option value="NotPaid">{t.cgoNotPaid}</option>
                <option value="Paid">{t.cgoPaid}</option>
              </select>
            </div>

            <div className="form-field">
              <label className="form-field__label">
                {t.cgoWhoPays} <span className="form-field__required">*</span>
              </label>
              <select
                className="form-field__input"
                value={data.whoPaysForCompanyService}
                onChange={e => handleServicePayerChange(e.target.value)}
              >
                <option value="Sender">{t.cgoSender}</option>
                <option value="Recipient">{t.cgoRecipientPayer}</option>
              </select>
            </div>
          </div>

          {/* Parcel price & Company Service Fee */}
          {showCollectAmount ? (
            <div className="grid grid--2">
              {/* Parcel Price */}
              <div className="form-field">
                <label className="form-field__label">
                  {t.cgoParcelPrice} <span className="form-field__required">*</span>
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
                  {t.cgoParcelHint}
                </p>
                {fieldError('amountToCollectForPackage') && (
                  <p className="form-field__error">{fieldError('amountToCollectForPackage')}</p>
                )}
              </div>

              {/* Company Service Fee — read-only */}
              <div className="form-field">
                <label className="form-field__label">{t.cgoServiceFee}</label>
                <input
                  type="number"
                  readOnly
                  className="form-field__input"
                  style={{ background: 'var(--color-bg-subtle, #f5f5f5)', cursor: 'default', color: 'var(--color-text-subtle)' }}
                  value={data.companyServicePrice ?? ''}
                  placeholder={t.cgoServiceFeePlaceholder}
                />
                <p className="form-field__hint" style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {data.whoPaysForCompanyService === 'Recipient'
                    ? t.cgoServiceFeeHintRecipient
                    : t.cgoServiceFeeHintSender}
                </p>
                {fieldError('companyServicePrice') && (
                  <p className="form-field__error">{fieldError('companyServicePrice')}</p>
                )}
              </div>
            </div>
          ) : (
            /* Paid — no parcel COD, but service fee still shown */
            <div className="form-field">
              <label className="form-field__label">{t.cgoServiceFee}</label>
              <input
                type="number"
                readOnly
                className="form-field__input"
                style={{ background: 'var(--color-bg-subtle, #f5f5f5)', cursor: 'default', color: 'var(--color-text-subtle)' }}
                value={data.companyServicePrice ?? ''}
                placeholder={t.cgoServiceFeePlaceholder}
              />
              <p className="form-field__hint" style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                {data.whoPaysForCompanyService === 'Recipient'
                  ? t.cgoServiceFeeHintRecipient
                  : t.cgoServiceFeeHintSender}
              </p>
              {fieldError('companyServicePrice') && (
                <p className="form-field__error">{fieldError('companyServicePrice')}</p>
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
            <span>{t.cgoFragile}</span>
          </label>
          {fieldError('isFragile') && (
            <p className="form-field__error">{fieldError('isFragile')}</p>
          )}
        </fieldset>
      </div>
    </div>
  );
}
