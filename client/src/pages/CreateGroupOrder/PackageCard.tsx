import { useState } from 'react';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { AddressAutocomplete } from '../../features/addressAutocomplete';
import type { District } from '../../api/cities';
import type { WeightPriceTier } from '../../api/weightPriceTiers';
import { tierLabel } from '../../api/weightPriceTiers';
import type { OrderItemRequest, OrderType, ValidationErrors } from '../../types/groupOrder';
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
  /** Customer's registered address — used to auto-fill the 'Deliver Back To' fields when orderType is Return */
  senderAddress?: { city: string; district: string; address: string } | null;
  /** Flat lookup of all districts by name (EN + Geo) — used to rehydrate district on weight tier change after layout switch */
  districtLookup?: Record<string, District>;
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
    data.recipientAddress.trim() &&
    (data.orderType !== 'Return' || (
      (data.returnPickupAddress ?? '').trim() &&
      (data.returnPickupCity ?? '').trim() &&
      (data.returnPickupDistrict ?? '').trim()
    ));

  return requiredFilled ? 'complete' as const : 'empty' as const;
}

function summaryLine(data: OrderItemRequest, placeholder: string): string {
  const parts: string[] = [];

  if (data.orderType && data.orderType !== 'Send') parts.push(`[${data.orderType}]`);
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

// ── Order type badge colours ───────────────────────────────────────────────────
const ORDER_TYPE_STYLE: Record<OrderType, { bg: string; color: string }> = {
  Send:     { bg: 'transparent',              color: 'var(--color-text-subtle)' },
  Return:   { bg: 'rgba(239,68,68,0.10)',     color: '#ef4444' },
  Exchange: { bg: 'rgba(59,130,246,0.10)',    color: '#3b82f6' },
};

// ── Component ──────────────────────────────────────────────────────────────────

export function PackageCard({
  index,
  data,
  errors,
  canRemove,
  customerPricing,
  weightTiers = [],
  senderAddress,
  districtLookup = {},
  onChange,
  onRemove,
}: PackageCardProps) {
  const { t, lang } = useLanguage();
  const [isOpen, setIsOpen] = useState(true);
  const [selectedDistrict, setSelectedDistrict] = useState<District | null>(null);
  const [selectedReturnDistrict, setSelectedReturnDistrict] = useState<District | null>(null);

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
  const isReturn   = data.orderType === 'Return';
  const isExchange = data.orderType === 'Exchange';
  const typeStyle  = ORDER_TYPE_STYLE[data.orderType ?? 'Send'];

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCityChange = (cityName: string) => {
    onChange(index, 'recipientCity', cityName);
    onChange(index, 'recipientDistrict', '');
    // For Return, the recipient block is the deliver-back-to address and its fee
    // comes from the return pickup district — don't disturb the fee here.
    if (!isReturn) {
      setSelectedDistrict(null);
      onChange(index, 'companyServicePrice', 0);
    }
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

  const handleReturnDistrictSelect = (district: District | null) => {
    setSelectedReturnDistrict(district);
    if (district) {
      const fee = computeServiceFee(district, data.weightPriceTierId);
      onChange(index, 'companyServicePrice', fee);
    } else {
      onChange(index, 'companyServicePrice', 0);
    }
  };

  const handleWeightTierChange = (tierId: string) => {
    onChange(index, 'weightPriceTierId', tierId);
    const activeDist = isReturn
      ? (selectedReturnDistrict ?? (data.returnPickupDistrict ? districtLookup[data.returnPickupDistrict] ?? null : null))
      : (selectedDistrict       ?? (data.recipientDistrict   ? districtLookup[data.recipientDistrict]    ?? null : null));
    if (activeDist) {
      const fee = computeServiceFee(activeDist, tierId || undefined);
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

  const handleOrderTypeChange = (value: string) => {
    onChange(index, 'orderType', value);
    setSelectedDistrict(null);
    setSelectedReturnDistrict(null);
    onChange(index, 'companyServicePrice', 0);
    if (value === 'Return') {
      onChange(index, 'whoPaysForCompanyService', 'Sender');
      // Return parcels are not COD — force the payment status to Paid and clear any collect amount
      onChange(index, 'productPaymentStatus', 'Paid');
      onChange(index, 'amountToCollectForPackage', 0);
      // Auto-fill deliver-back-to address from the customer's registered address
      if (senderAddress) {
        onChange(index, 'recipientCity',     senderAddress.city);
        onChange(index, 'recipientDistrict', senderAddress.district);
        onChange(index, 'recipientAddress',  senderAddress.address);
      }
    } else {
      // For Send / Exchange, clear recipient address so user fills it fresh
      onChange(index, 'recipientCity',     '');
      onChange(index, 'recipientDistrict', '');
      onChange(index, 'recipientAddress',  '');
    }
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

          {/* Order type chip */}
          {data.orderType && data.orderType !== 'Send' && (
            <span
              className="package-card__type-chip"
              style={{ background: typeStyle.bg, color: typeStyle.color }}
            >
              {data.orderType === 'Return'   ? (t.cgoOrderTypeReturn   ?? 'Return')   : null}
              {data.orderType === 'Exchange' ? (t.cgoOrderTypeExchange ?? 'Exchange') : null}
            </span>
          )}

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

          {/* ── Order Type selector ── */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">{t.cgoOrderTypeLabel ?? 'Order Type'}</legend>
            <div className="package-card__type-row">
              {(['Send', 'Return', 'Exchange'] as OrderType[]).map(type => (
                <button
                  key={type}
                  type="button"
                  className={`package-card__type-btn${data.orderType === type ? ' package-card__type-btn--active' : ''}`}
                  style={data.orderType === type ? { background: ORDER_TYPE_STYLE[type].bg, borderColor: ORDER_TYPE_STYLE[type].color, color: ORDER_TYPE_STYLE[type].color } : {}}
                  onClick={() => handleOrderTypeChange(type)}
                >
                  {type === 'Send'     && (t.cgoOrderTypeSend     ?? 'Send')}
                  {type === 'Return'   && (t.cgoOrderTypeReturn   ?? 'Return')}
                  {type === 'Exchange' && (t.cgoOrderTypeExchange ?? 'Exchange')}
                </button>
              ))}
            </div>
          </fieldset>

          {/* ── Return pickup address (only when Return) ── */}
          {isReturn && (
            <fieldset className="fieldset package-card__return-section">
              <legend className="fieldset__legend" style={{ color: '#ef4444' }}>
                {t.cgoReturnPickupAddress ?? '📍 Return Pickup Address'}
              </legend>
              <p className="package-card__return-hint">
                {t.cgoReturnPickupHint ?? 'Enter the address where the courier will collect the parcel from the recipient.'}
              </p>
              <CityDistrictPicker
                cityValue={data.returnPickupCity ?? ''}
                districtValue={data.returnPickupDistrict ?? ''}
                onCityChange={v => { onChange(index, 'returnPickupCity', v); onChange(index, 'returnPickupDistrict', ''); setSelectedReturnDistrict(null); onChange(index, 'companyServicePrice', 0); }}
                onDistrictChange={v => onChange(index, 'returnPickupDistrict', v)}
                onDistrictSelect={handleReturnDistrictSelect}
                cityError={fieldError('returnPickupCity')}
                districtError={fieldError('returnPickupDistrict')}
              />
              <AddressAutocomplete
                label={t.cgoStreetAddress}
                required
                value={data.returnPickupAddress ?? ''}
                onValueChange={v => onChange(index, 'returnPickupAddress', v)}
                error={fieldError('returnPickupAddress')}
                placeholder={t.cgoStreetPlaceholder}
                maxLength={250}
                lang={lang}
              />
            </fieldset>
          )}

          {/* Exchange hint */}
          {isExchange && (
            <div className="package-card__exchange-hint">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              {t.cgoExchangeHint ?? 'Exchange: fill in the recipient address to deliver the replacement parcel to.'}
            </div>
          )}

          {/* Recipient Info */}
          <fieldset className="fieldset">
            <legend className="fieldset__legend">{t.cgoRecipientInfo}</legend>
            <div className="grid grid--2">
              <FormField
                label={t.cgoRecipientFirstName}
                required
                value={data.recipientFirstName}
                onChange={e => onChange(index, 'recipientFirstName', e.target.value)}
                error={fieldError('recipientFirstName')}
                placeholder={t.cgoRecipientFNPlaceholder}
                maxLength={100}
              />
              <FormField
                label={t.cgoRecipientLastName}
                required
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
            <legend className="fieldset__legend">
              {isReturn ? (t.cgoReturnDeliverBackTo ?? 'Deliver Back To (Sender)') : t.cgoDeliveryAddress}
            </legend>

            <CityDistrictPicker
              cityValue={data.recipientCity}
              districtValue={data.recipientDistrict}
              onCityChange={handleCityChange}
              onDistrictChange={handleDistrictChange}
              onDistrictSelect={isReturn ? () => {} : handleDistrictSelect}
              cityError={fieldError('recipientCity')}
              districtError={fieldError('recipientDistrict')}
            />

            <AddressAutocomplete
              label={t.cgoStreetAddress}
              required
              value={data.recipientAddress}
              onValueChange={v => onChange(index, 'recipientAddress', v)}
              error={fieldError('recipientAddress')}
              placeholder={t.cgoStreetPlaceholder}
              maxLength={250}
              lang={lang}
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
              {!isReturn && (
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
              )}

              {/* Who pays the courier fee is only a choice when the parcel is
                  already paid. For unpaid (COD) parcels the recipient always
                  pays it at delivery, so the field is hidden and forced to
                  Recipient (see handlePaymentStatusChange). */}
              {!showCollectAmount && (
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
              )}
            </div>

            {showCollectAmount ? (
              <>
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

              <div className="form-field">
                <label className="form-field__label">{t.cgoTotalPrice}</label>
                <input
                  type="number"
                  readOnly
                  className="form-field__input"
                  style={{ background: 'var(--color-bg-subtle, #f5f5f5)', cursor: 'default', color: 'var(--color-text)', fontWeight: 700 }}
                  value={((data.amountToCollectForPackage ?? 0) + (data.companyServicePrice ?? 0)).toFixed(2)}
                />
                <p className="form-field__hint" style={{ marginTop: 4, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {t.cgoTotalPriceHint}
                </p>
              </div>
              </>
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

      <style>{`
        .package-card__type-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .package-card__type-btn {
          padding: 7px 16px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg-3);
          color: var(--color-text-subtle);
          font-family: var(--font-body);
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: all var(--transition);
        }
        .package-card__type-btn:hover {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
        .package-card__type-btn--active {
          font-weight: 700;
        }
        .package-card__type-chip {
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 99px;
          border: 1px solid currentColor;
          white-space: nowrap;
        }
        .package-card__return-section {
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: var(--radius-sm);
          padding: 14px 16px;
          background: rgba(239,68,68,0.04);
        }
        .package-card__return-hint {
          font-size: 0.8rem;
          color: var(--color-text-muted);
          margin-bottom: 12px;
          line-height: 1.5;
        }
        .package-card__exchange-hint {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 0.8rem;
          color: #3b82f6;
          background: rgba(59,130,246,0.06);
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          line-height: 1.5;
        }
      `}</style>
    </div>
  );
}
