import { useState } from 'react';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import type { District } from '../../api/cities';
import type { WeightPriceTier } from '../../api/weightPriceTiers';
import { tierLabel } from '../../api/weightPriceTiers';
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
  weightTiers?: WeightPriceTier[];
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => void;
  onRemove: (index: number) => void;
}

// ── Status helpers ─────────────────────────────────────────────────────────────

function cardStatus(data: OrderItemRequest, errors: ValidationErrors, index: number) {
  const hasError = Object.keys(errors).some(k => k.startsWith(`orders[${index}]`));
  if (hasError) return 'error' as const;

  const requiredFilled =
    data.recipientPhone.trim() &&
    data.recipientCity.trim() &&
    data.recipientDistrict.trim() &&
    data.recipientAddress.trim();

  return requiredFilled ? 'complete' as const : 'empty' as const;
}

function summaryLine(data: OrderItemRequest, placeholder: string): string {
  const parts: string[] = [];

  const name = [data.recipientFirstName, data.recipientLastName].filter(Boolean).join(' ');
  if (name) parts.push(name);
  if (data.recipientPhone) parts.push(data.recipientPhone);
  if (data.recipientCity) {
    parts.push(data.recipientDistrict
      ? `${data.recipientCity}, ${data.recipientDistrict}`
      : data.recipientCity);
  }

  return parts.length > 0 ? parts.join(' · ') : placeholder;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function PackageCard({
  index,
  data,
  errors,
  canRemove,
  customerPricing,
  weightTiers = [],
  onChange,
  onRemove,
}: PackageCardProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);

  const fieldError = (field: string) => errors[`orders[${index}].${field}`];
  const status = cardStatus(data, errors, index);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const computeServiceFee = (district: District, tierId?: string): number => {
    if (tierId) {
      const tier = weightTiers.find(t => t.id === tierId);
      if (tier) {
        const zonePrice = district.isCapitalTerritory ? tier.capitalPrice
                        : district.isCityTerritory    ? tier.cityPrice
                                                      : tier.districtPrice;
        if ((zonePrice ?? 0) > 0) return zonePrice!;
      }
    }
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

  const showCollectAmount = data.productPaymentStatus === 'NotPaid';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCityChange = (cityName: string) => {
    onChange(index, 'recipientCity', cityName);
    onChange(index, 'recipientDistrict', '');
    setSelectedDistrict(null);
  };

  const handleDistrictChange = (districtName: string) => {
    onChange(index, 'recipientDistrict', districtName);
  };

  const handleDistrictSelect = (district: District | null) => {
    setSelectedDistrict(district);
    if (district) {
      const fee = computeServiceFee(district, data.weightPriceTierId);
      onChange(index, 'companyServicePrice', fee);
    } else {
      onChange(index, 'companyServicePrice', 0);
    }
  };

  const handleWeightTierChange = (tierId: string) => {
    onChange(index, 'weightPriceTierId', tierId);
    if (selectedDistrict) {
      const fee = computeServiceFee(selectedDistrict, tierId || undefined);
      onChange(index, 'companyServicePrice', fee);
    }
  };

  const handlePaymentStatusChange = (value: string) => {
    onChange(index, 'productPaymentStatus', value);
    if (value === 'NotPaid') {
      onChange(index, 'whoPaysForCompanyService', 'Recipient');
    } else {
      onChange(index, 'amountToCollectForPackage', 0);
    }
  };

  const handleServicePayerChange = (value: string) => {
    onChange(index, 'whoPaysForCompanyService', value);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={`package-card package-card--${status} ${isOpen ? 'package-card--open' : 'package-card--closed'}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* ── Card Header (always visible, acts as toggle) ── */}
      <div className="package-card__header">
        <button
          type="button"
          className="package-card__toggle"
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          {/* Status stripe */}
          <span className="package-card__stripe" aria-hidden="true" />

          {/* Badge */}
          <span className="package-card__badge">
            <span className="package-card__badge-label">{t.cgoPackageLabel}</span>
            <span className="package-card__badge-num">{String(index + 1).padStart(2, '0')}</span>
          </span>

          {/* Summary (shown when collapsed, fades when open) */}
          <span className="package-card__summary" aria-hidden={isOpen}>
            {summaryLine(data, t.cgoNoRecipientYet)}
          </span>

          {/* Status dot */}
          <span className={`package-card__status-dot package-card__status-dot--${status}`} aria-hidden="true" />

          {/* Chevron */}
          <span className={`package-card__chevron ${isOpen ? 'package-card__chevron--open' : ''}`} aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        {/* Remove button (always visible) */}
        {canRemove && (
          <button
            type="button"
            className="package-card__remove"
            onClick={() => onRemove(index)}
            aria-label={`${t.cgoRemove} ${index + 1}`}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t.cgoRemove}
          </button>
        )}
      </div>

      {/* ── Collapsible Body ── */}
      <div className="package-card__collapse" aria-hidden={!isOpen}>
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

            {weightTiers.length > 0 && (
              <div className="form-field">
                <label className="form-field__label">
                  {t.cgoWeightTier} <span className="form-field__required">*</span>
                </label>
                <select
                  className="form-field__input"
                  value={data.weightPriceTierId ?? ''}
                  onChange={e => handleWeightTierChange(e.target.value)}
                >
                  <option value="">{t.cgoWeightTierPlaceholder}</option>
                  {weightTiers.map(tier => (
                    <option key={tier.id} value={tier.id}>
                      {tierLabel(tier)}
                    </option>
                  ))}
                </select>
                {fieldError('weightPriceTierId') && (
                  <p className="form-field__error">{fieldError('weightPriceTierId')}</p>
                )}
              </div>
            )}

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

            {showCollectAmount ? (
              <div className="grid grid--2">
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
    </div>
  );
}
