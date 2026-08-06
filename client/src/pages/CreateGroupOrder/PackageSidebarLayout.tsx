import { useState, useCallback, useEffect, useRef } from 'react';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { FormField } from '../../components/ui/FormField';
import { GeorgianPhoneField } from '../../components/ui/GeorgianPhoneField';
import type { District } from '../../api/cities';
import type { WeightPriceTier } from '../../api/weightPriceTiers';
import { tierLabel } from '../../api/weightPriceTiers';
import type { OrderItemRequest, ValidationErrors, OrderType } from '../../types/groupOrder';
import { useLanguage } from '../../contexts/useLanguage';

interface CustomerPricing {
  companyServiceCapitalPrice:  number | null;
  companyServiceCityPrice:     number | null;
  companyServiceDistrictPrice: number | null;
}

interface Props {
  packages: OrderItemRequest[];
  errors: ValidationErrors;
  customerPricing?: CustomerPricing | null;
  weightTiers?: WeightPriceTier[];
  senderAddress?: { city: string; district: string; address: string } | null;
  /** Batch pickup district name — when it isn't the capital (Tbilisi), Send/Exchange
   *  packages are priced off the pickup location instead of the recipient. */
  pickupDistrictName?: string | null;
  /** Flat lookup of all districts by name (EN + Geo) — used to rehydrate district on weight tier change after layout switch */
  districtLookup?: Record<string, District>;
  /** When the customer's account forces all-in pricing, the per-package checkbox is hidden. */
  serviceIncludedForced?: boolean;
  /** Returns are standalone orders and can never join a batch, so the type is hidden when
   *  appending to one — the backend validator would reject the whole submission. */
  allowReturn?: boolean;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number | null) => void;
  onRemove: (index: number) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pkgStatus(pkg: OrderItemRequest, errors: ValidationErrors, index: number) {
  const hasErr = Object.keys(errors).some(k => k.startsWith(`orders[${index}]`));
  if (hasErr) return 'error';
  const filled = pkg.recipientPhone.trim() && pkg.recipientCity.trim() &&
    pkg.recipientDistrict.trim() && pkg.recipientAddress.trim() &&
    (pkg.orderType !== 'Return' || (
      (pkg.returnPickupCity ?? '').trim() &&
      (pkg.returnPickupDistrict ?? '').trim() &&
      (pkg.returnPickupAddress ?? '').trim()
    ));
  return filled ? 'ok' : 'empty';
}

// `district` is the default pricing zone (the swapped pickup district when the swap
// applies); `customerZone` is the delivery location, which is what the customer's
// negotiated rates are always read off — the swap must not shift them to the pickup's zone.
function computeFee(
  district: District,
  customerZone: District | null,
  tierId: string | undefined,
  weightTiers: WeightPriceTier[],
  customerPricing?: CustomerPricing | null
): number | null {
  if (tierId) {
    const tier = weightTiers.find(t => t.id === tierId);
    if (tier) {
      const zp = district.isCapitalTerritory ? tier.capitalPrice
               : district.isCityTerritory    ? tier.cityPrice
                                              : tier.districtPrice;
      if ((zp ?? 0) > 0) return zp!;
    }
  }
  if (customerPricing) {
    if (customerZone?.isCapitalTerritory && (customerPricing.companyServiceCapitalPrice ?? 0) > 0)
      return customerPricing.companyServiceCapitalPrice!;
    if (customerZone?.isCityTerritory && (customerPricing.companyServiceCityPrice ?? 0) > 0)
      return customerPricing.companyServiceCityPrice!;
    if ((customerPricing.companyServiceDistrictPrice ?? 0) > 0)
      return customerPricing.companyServiceDistrictPrice!;
  }
  // No tier / customer / district price configured → leave the fee unset (null)
  // so the field reads as empty; admin can fill it in later when editing the order.
  return district.companyServicePrice ?? null;
}

function pkgSummary(pkg: OrderItemRequest): string {
  const name = pkg.recipientName;
  const loc  = [pkg.recipientCity, pkg.recipientDistrict].filter(Boolean).join(', ');
  if (name && loc) return `${name} · ${loc}`;
  if (name)        return name;
  if (pkg.recipientPhone) return pkg.recipientPhone;
  return '';
}

const ORDER_TYPE_COLORS: Record<OrderType, { bg: string; color: string; border: string }> = {
  Send:     { bg: 'transparent',              color: 'var(--color-text-subtle)', border: 'var(--color-border)' },
  Return:   { bg: 'rgba(192,57,43,0.08)',     color: '#c0392b',                  border: 'rgba(192,57,43,0.4)' },
  Exchange: { bg: 'rgba(59,130,246,0.08)',    color: '#3b82f6',                  border: 'rgba(59,130,246,0.4)' },
};

// ── Detail panel ──────────────────────────────────────────────────────────────

interface DetailProps {
  index: number;
  pkg: OrderItemRequest;
  errors: ValidationErrors;
  canRemove: boolean;
  customerPricing?: CustomerPricing | null;
  weightTiers: WeightPriceTier[];
  senderAddress?: { city: string; district: string; address: string } | null;
  pickupDistrictName?: string | null;
  districtLookup: Record<string, District>;
  serviceIncludedForced: boolean;
  allowReturn: boolean;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number | null) => void;
  onRemove: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  total: number;
}

function PackageDetail({
  index, pkg, errors, canRemove, customerPricing, weightTiers,
  senderAddress, pickupDistrictName, districtLookup, serviceIncludedForced, allowReturn, onChange, onRemove, onPrev, onNext, hasPrev, hasNext, total,
}: DetailProps) {
  const { t } = useLanguage();
  const fe = (f: string) => errors[`orders[${index}].${f}`];
  const isReturn   = pkg.orderType === 'Return';
  const isExchange = pkg.orderType === 'Exchange';
  const showCOD    = pkg.productPaymentStatus === 'NotPaid';
  // All-in pricing: the entered price already includes the company service fee.
  const serviceIncluded = serviceIncludedForced || !!pkg.isCompanyServicePriceIncluded;

  const [selectedDistrict,       setSelectedDistrict]       = useState<District | null>(null);
  const [selectedReturnDistrict, setSelectedReturnDistrict] = useState<District | null>(null);

  // Pickup district drives swapped pricing: when it isn't the capital (Tbilisi) and the
  // package goes TO the capital, Send/Exchange packages take their *default* price from the
  // pickup instead of the recipient. Non-capital → non-capital prices off the recipient as
  // usual. The customer's negotiated rates always follow the delivery district.
  const pickupDistrict = pickupDistrictName ? (districtLookup[pickupDistrictName] ?? null) : null;
  const pricingDistrictFor = useCallback((recipientDistrict: District | null): District | null =>
    pickupDistrict && !pickupDistrict.isCapitalTerritory && recipientDistrict?.isCapitalTerritory
      ? pickupDistrict
      : recipientDistrict,
    [pickupDistrict]);

  const handleDistrictSelect = useCallback((district: District | null) => {
    setSelectedDistrict(district);
    const priceDist = district ? pricingDistrictFor(district) : null;
    onChange(index, 'companyServicePrice', priceDist ? computeFee(priceDist, district, pkg.weightPriceTierId, weightTiers, customerPricing) : null);
  }, [index, pkg.weightPriceTierId, weightTiers, customerPricing, onChange, pricingDistrictFor]);

  const handleReturnDistrictSelect = useCallback((district: District | null) => {
    // Returns price off their own pickup district — no swap.
    setSelectedReturnDistrict(district);
    if (district) onChange(index, 'companyServicePrice', computeFee(district, district, pkg.weightPriceTierId, weightTiers, customerPricing));
    else onChange(index, 'companyServicePrice', null);
  }, [index, pkg.weightPriceTierId, weightTiers, customerPricing, onChange]);

  const handleWeightTierChange = (tierId: string) => {
    onChange(index, 'weightPriceTierId', tierId);
    const zoneDist = isReturn
      ? (selectedReturnDistrict ?? (pkg.returnPickupDistrict ? districtLookup[pkg.returnPickupDistrict] ?? null : null))
      : (selectedDistrict ?? (pkg.recipientDistrict ? districtLookup[pkg.recipientDistrict] ?? null : null));
    const activeDist = isReturn ? zoneDist : pricingDistrictFor(zoneDist);
    if (activeDist) {
      onChange(index, 'companyServicePrice', computeFee(activeDist, zoneDist, tierId || undefined, weightTiers, customerPricing));
    }
  };

  const handleOrderTypeChange = (type: OrderType) => {
    onChange(index, 'orderType', type);
    setSelectedDistrict(null);
    setSelectedReturnDistrict(null);
    onChange(index, 'companyServicePrice', null);
    // Drop any geocoded coordinates — the operative address changes with the type.
    onChange(index, 'latitude', null);
    onChange(index, 'longitude', null);
    if (type === 'Return') {
      onChange(index, 'whoPaysForCompanyService', 'Sender');
      // Return parcels are not COD — force the payment status to Paid and clear any collect amount
      onChange(index, 'productPaymentStatus', 'Paid');
      onChange(index, 'amountToCollectForPackage', 0);
      if (senderAddress) {
        onChange(index, 'recipientCity',     senderAddress.city);
        onChange(index, 'recipientDistrict', senderAddress.district);
        onChange(index, 'recipientAddress',  senderAddress.address);
      }
    } else {
      onChange(index, 'recipientCity',     '');
      onChange(index, 'recipientDistrict', '');
      onChange(index, 'recipientAddress',  '');
    }
  };

  const handlePaymentStatusChange = (val: string) => {
    onChange(index, 'productPaymentStatus', val);
    if (val === 'NotPaid') {
      onChange(index, 'whoPaysForCompanyService', 'Recipient');
    } else {
      onChange(index, 'whoPaysForCompanyService', 'Sender');
      onChange(index, 'amountToCollectForPackage', 0);
    }
  };

  // Scroll detail body to top whenever the package index changes
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [index]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === 'ArrowLeft'  && hasPrev) onPrev();
      if (e.key === 'ArrowRight' && hasNext) onNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [hasPrev, hasNext, onPrev, onNext]);

  const typeStyle = ORDER_TYPE_COLORS[pkg.orderType ?? 'Send'];
  const status = pkgStatus(pkg, errors, index);

  return (
    <div className="psl-detail">
      {/* Detail header */}
      <div className="psl-detail__header">
        <div className="psl-detail__title">
          <span className="psl-detail__pkg-label">{t.cgoPackageLabel} {String(index + 1).padStart(2, '0')}</span>
          {pkg.orderType !== 'Send' && (
            <span className="psl-type-chip" style={{ background: typeStyle.bg, color: typeStyle.color, border: `1px solid ${typeStyle.border}` }}>
              {pkg.orderType}
            </span>
          )}
          {status === 'error' && <span className="psl-status-tag psl-status-tag--err">{t.cgoNeedsAttention}</span>}
        </div>
        <div className="psl-detail__nav">
          <button type="button" className="psl-nav-btn" disabled={!hasPrev} onClick={onPrev} title="Previous (←)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <span className="psl-nav-pos">{index + 1} / {total}</span>
          <button type="button" className="psl-nav-btn" disabled={!hasNext} onClick={onNext} title="Next (→)">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {canRemove && (
            <button type="button" className="psl-remove-btn" onClick={() => onRemove(index)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {t.cgoRemove}
            </button>
          )}
        </div>
      </div>

      {/* Scrollable form body */}
      <div className="psl-detail__body" ref={bodyRef}>

        {/* Order Type */}
        <div className="psl-section">
          <div className="psl-section__label">{t.cgoOrderTypeLabel ?? 'Order type'}</div>
          <div className="psl-type-row">
            {(['Send', 'Return', 'Exchange'] as OrderType[])
              .filter(tp => tp !== 'Return' || allowReturn)
              .map(tp => {
              const s = ORDER_TYPE_COLORS[tp];
              return (
                <button
                  key={tp}
                  type="button"
                  className={`psl-type-btn${pkg.orderType === tp ? ' psl-type-btn--active' : ''}`}
                  style={pkg.orderType === tp ? { background: s.bg, borderColor: s.border, color: s.color } : {}}
                  onClick={() => handleOrderTypeChange(tp)}
                >
                  {tp === 'Send'     && (t.cgoOrderTypeSend     ?? 'Send')}
                  {tp === 'Return'   && (t.cgoOrderTypeReturn   ?? 'Return')}
                  {tp === 'Exchange' && (t.cgoOrderTypeExchange ?? 'Exchange')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Exchange info hint */}
        {isExchange && (
          <div className="psl-hint psl-hint--blue">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            {t.cgoExchangeHint ?? 'Fill in the recipient address to deliver the replacement parcel to.'}
          </div>
        )}

        {/* Return: pickup address */}
        {isReturn && (
          <div className="psl-section psl-section--return">
            <div className="psl-section__label" style={{ color: '#c0392b' }}>
              {t.cgoReturnPickupAddress ?? '📍 Return Pickup Address'}
            </div>
            <p className="psl-return-hint">{t.cgoReturnPickupHint ?? 'Address where courier will collect the parcel from the recipient.'}</p>
            <CityDistrictPicker
              cityValue={pkg.returnPickupCity ?? ''}
              districtValue={pkg.returnPickupDistrict ?? ''}
              onCityChange={v => { onChange(index, 'returnPickupCity', v); onChange(index, 'returnPickupDistrict', ''); setSelectedReturnDistrict(null); onChange(index, 'companyServicePrice', null); }}
              onDistrictChange={v => onChange(index, 'returnPickupDistrict', v)}
              onDistrictSelect={handleReturnDistrictSelect}
              cityError={fe('returnPickupCity')}
              districtError={fe('returnPickupDistrict')}
            />
            <FormField
              label={t.cgoStreetAddress} required
              value={pkg.returnPickupAddress ?? ''}
              onChange={e => onChange(index, 'returnPickupAddress', e.target.value)}
              error={fe('returnPickupAddress')}
              placeholder={t.cgoStreetPlaceholder}
              maxLength={250}
            />
          </div>
        )}

        {/* Recipient info */}
        <div className="psl-section">
          <div className="psl-section__label">{t.cgoRecipientInfo}</div>
          <FormField
            label={t.cgoRecipientName}
            value={pkg.recipientName}
            onChange={e => onChange(index, 'recipientName', e.target.value)}
            error={fe('recipientName')}
            placeholder={t.cgoRecipientFNPlaceholder}
            maxLength={200}
          />
          <GeorgianPhoneField
            label={t.cgoRecipientPhone} required
            value={pkg.recipientPhone}
            onValueChange={v => onChange(index, 'recipientPhone', v)}
            error={fe('recipientPhone')}
            invalidMessage={t.cgoErrInvalidPhone}
          />
        </div>

        {/* Delivery address */}
        <div className="psl-section">
          <div className="psl-section__label">
            {isReturn ? (t.cgoReturnDeliverBackTo ?? 'Deliver back to (Sender)') : t.cgoDeliveryAddress}
          </div>
          <CityDistrictPicker
            cityValue={pkg.recipientCity}
            districtValue={pkg.recipientDistrict}
            onCityChange={v => { onChange(index, 'recipientCity', v); onChange(index, 'recipientDistrict', ''); if (!isReturn) { setSelectedDistrict(null); onChange(index, 'companyServicePrice', null); } }}
            onDistrictChange={v => onChange(index, 'recipientDistrict', v)}
            onDistrictSelect={isReturn ? () => {} : handleDistrictSelect}
            cityError={fe('recipientCity')}
            districtError={fe('recipientDistrict')}
          />
          <FormField
            label={t.cgoStreetAddress} required
            value={pkg.recipientAddress}
            onChange={e => onChange(index, 'recipientAddress', e.target.value)}
            error={fe('recipientAddress')}
            placeholder={t.cgoStreetPlaceholder}
            maxLength={250}
          />
          <FormField
            as="textarea" label={`${t.cgoPackageDescription} ${t.cgoDescOptional}`}
            value={pkg.description ?? ''}
            onChange={e => onChange(index, 'description', e.target.value)}
            error={fe('description')}
            placeholder={t.cgoDescPlaceholder}
            rows={2}
            maxLength={500}
          />
        </div>

        {/* Package options */}
        <div className="psl-section">
          <div className="psl-section__label">{t.cgoPackageOptions}</div>

          {weightTiers.length > 0 && (
            <div className="form-field">
              <label className="form-field__label">{t.cgoWeightTier}</label>
              <select
                className="form-field__input"
                value={pkg.weightPriceTierId ?? ''}
                onChange={e => handleWeightTierChange(e.target.value)}
              >
                {/* Default is "Standard" (no tier) — a chosen tier takes over pricing. */}
                <option value="">{t.cgoWeightTierStandard}</option>
                {weightTiers.map(tier => (
                  <option key={tier.id} value={tier.id}>{tierLabel(tier)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="psl-grid psl-grid--2">
            {!isReturn && (
              <div className="form-field">
                <label className="form-field__label">{t.cgoPaymentStatus} <span className="form-field__required">*</span></label>
                <select className="form-field__input" value={pkg.productPaymentStatus} onChange={e => handlePaymentStatusChange(e.target.value)}>
                  <option value="NotPaid">{t.cgoNotPaid}</option>
                  <option value="Paid">{t.cgoPaid}</option>
                </select>
              </div>
            )}
            {/* Hidden for unpaid (COD) parcels — the recipient always pays the
                courier fee at delivery, forced to Recipient in
                handlePaymentStatusChange. Only a choice when already paid. */}
            {!showCOD && (
              <div className="form-field">
                <label className="form-field__label">{t.cgoWhoPays} <span className="form-field__required">*</span></label>
                <select className="form-field__input" value={pkg.whoPaysForCompanyService} onChange={e => onChange(index, 'whoPaysForCompanyService', e.target.value)}>
                  <option value="Sender">{t.cgoSender}</option>
                  <option value="Recipient">{t.cgoRecipientPayer}</option>
                </select>
              </div>
            )}
          </div>

          {showCOD && !serviceIncludedForced && (
            <label className="package-card__fragile-toggle" style={{ marginBottom: 2 }}>
              <input
                type="checkbox"
                checked={!!pkg.isCompanyServicePriceIncluded}
                onChange={e => onChange(index, 'isCompanyServicePriceIncluded', e.target.checked)}
              />
              <span>{t.cgoServiceIncluded}</span>
            </label>
          )}

          {showCOD && serviceIncluded && (
            <div className="form-field">
              <label className="form-field__label">{t.cgoPriceAllIn} <span className="form-field__required">*</span></label>
              <input
                type="number" min={0} step="0.01" inputMode="decimal"
                className="form-field__input"
                value={pkg.amountToCollectForPackage ?? ''}
                onChange={e => { const v = parseFloat(e.target.value); onChange(index, 'amountToCollectForPackage', isNaN(v) ? null : v); }}
                onWheel={e => e.currentTarget.blur()}
                placeholder="e.g. 100.00"
              />
              {fe('amountToCollectForPackage') && <p className="form-field__error">{fe('amountToCollectForPackage')}</p>}
              <p className="form-field__hint">{t.cgoPriceAllInHint}</p>
            </div>
          )}

          {showCOD && !serviceIncluded && (
            <div className="psl-grid psl-grid--2">
              <div className="form-field">
                <label className="form-field__label">{t.cgoParcelPrice} <span className="form-field__required">*</span></label>
                <input
                  type="number" min={0} step="0.01" inputMode="decimal"
                  className="form-field__input"
                  value={pkg.amountToCollectForPackage ?? ''}
                  onChange={e => { const v = parseFloat(e.target.value); onChange(index, 'amountToCollectForPackage', isNaN(v) ? null : v); }}
                  onWheel={e => e.currentTarget.blur()}
                  placeholder="e.g. 45.00"
                />
                {fe('amountToCollectForPackage') && <p className="form-field__error">{fe('amountToCollectForPackage')}</p>}
                <p className="form-field__hint">{t.cgoParcelHint}</p>
              </div>
              <div className="form-field">
                <label className="form-field__label">{t.cgoServiceFee}</label>
                <input
                  type="number" readOnly className="form-field__input"
                  style={{ background: 'var(--color-bg-3)', cursor: 'default', color: 'var(--color-accent)', fontWeight: 600 }}
                  value={pkg.companyServicePrice ?? ''}
                  placeholder={t.cgoServiceFeePlaceholder}
                />
                <p className="form-field__hint">{pkg.whoPaysForCompanyService === 'Recipient' ? t.cgoServiceFeeHintRecipient : t.cgoServiceFeeHintSender}</p>
                {fe('companyServicePrice') && <p className="form-field__error">{fe('companyServicePrice')}</p>}
              </div>
            </div>
          )}

          {showCOD && !serviceIncluded && (
            <div className="form-field">
              <label className="form-field__label">{t.cgoTotalPrice}</label>
              <input
                type="number" readOnly className="form-field__input"
                style={{ background: 'var(--color-bg-3)', cursor: 'default', color: 'var(--color-text)', fontWeight: 700 }}
                value={((pkg.amountToCollectForPackage ?? 0) + (pkg.companyServicePrice ?? 0)).toFixed(2)}
              />
              <p className="form-field__hint">{t.cgoTotalPriceHint}</p>
            </div>
          )}

          {!showCOD && (
            <div className="form-field">
              <label className="form-field__label">{t.cgoServiceFee}</label>
              <input
                type="number" readOnly className="form-field__input"
                style={{ background: 'var(--color-bg-3)', cursor: 'default', color: 'var(--color-accent)', fontWeight: 600 }}
                value={pkg.companyServicePrice ?? ''}
                placeholder={t.cgoServiceFeePlaceholder}
              />
              <p className="form-field__hint">{pkg.whoPaysForCompanyService === 'Recipient' ? t.cgoServiceFeeHintRecipient : t.cgoServiceFeeHintSender}</p>
              {fe('companyServicePrice') && <p className="form-field__error">{fe('companyServicePrice')}</p>}
            </div>
          )}

          <label className="package-card__fragile-toggle">
            <input type="checkbox" checked={pkg.isFragile} onChange={e => onChange(index, 'isFragile', e.target.checked)} />
            <span className="package-card__fragile-icon" aria-hidden="true">⚠</span>
            <span>{t.cgoFragile}</span>
          </label>
          {fe('isFragile') && <p className="form-field__error">{fe('isFragile')}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main sidebar component ────────────────────────────────────────────────────

export function PackageSidebarLayout({ packages, errors, customerPricing, weightTiers = [], senderAddress, pickupDistrictName, districtLookup = {}, serviceIncludedForced = false, allowReturn = true, onChange, onRemove }: Props) {
  const { t } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const [listCollapsed, setListCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep activeIndex in bounds when packages shrink
  useEffect(() => {
    if (activeIndex >= packages.length) setActiveIndex(Math.max(0, packages.length - 1));
  }, [packages.length, activeIndex]);

  // Scroll active item into view within the sidebar list only — never move the page
  useEffect(() => {
    const list = sidebarRef.current?.querySelector('.psl-sidebar__list') as HTMLElement | null;
    const el   = sidebarRef.current?.querySelector(`[data-idx="${activeIndex}"]`) as HTMLElement | null;
    if (!list || !el) return;
    const listTop    = list.scrollTop;
    const listBottom = listTop + list.clientHeight;
    const elTop      = el.offsetTop;
    const elBottom   = elTop + el.offsetHeight;
    if (elTop < listTop) {
      list.scrollTop = elTop;
    } else if (elBottom > listBottom) {
      list.scrollTop = elBottom - list.clientHeight;
    }
  }, [activeIndex]);

  const handleRemove = (index: number) => {
    onRemove(index);
    setActiveIndex(i => Math.min(i, packages.length - 2));
  };

  // When a package is added (length grows), jump to the new one and scroll the
  // editor's first fields into view (the "+ Add package" button sits at the bottom
  // of the page, so otherwise the new package's fields stay below the fold).
  const prevLen = useRef(packages.length);
  useEffect(() => {
    if (packages.length > prevLen.current) {
      setActiveIndex(packages.length - 1);
      setListCollapsed(false);
      setTimeout(() => {
        const el = rootRef.current;
        if (!el) return;
        const top = el.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      }, 50);
    }
    prevLen.current = packages.length;
  }, [packages.length]);

  // Clamp at render time: when packages shrink (e.g. the form resets to one package
  // after "Add to cart") activeIndex can briefly point past the end. The bounds effect
  // above only fixes it on the next render, so guard here to avoid indexing undefined.
  const safeIndex = Math.min(activeIndex, Math.max(0, packages.length - 1));

  const readyCount = packages.filter((p, i) => pkgStatus(p, errors, i) === 'ok').length;
  const errorCount = packages.filter((p, i) => pkgStatus(p, errors, i) === 'error').length;

  return (
    <div className="psl-root" ref={rootRef}>
      {/* ── Sidebar ── */}
      <div className={`psl-sidebar${listCollapsed ? ' psl-sidebar--collapsed' : ''}`} ref={sidebarRef}>
        <div className="psl-sidebar__header">
          <span className="psl-sidebar__count">{t.cgoSidebarCount(packages.length)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div className="psl-sidebar__stats">
              {readyCount > 0 && <span className="psl-mini-pill psl-mini-pill--ok">{readyCount} ✓</span>}
              {errorCount > 0 && <span className="psl-mini-pill psl-mini-pill--err">{errorCount} !</span>}
            </div>
            <button
              type="button"
              className="psl-sidebar__toggle"
              onClick={() => setListCollapsed(c => !c)}
              aria-label={listCollapsed ? 'Expand package list' : 'Collapse package list'}
            >
              <svg
                width="14" height="14" viewBox="0 0 16 16" fill="none"
                style={{ transform: listCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
              >
                <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="psl-sidebar__list">
          {packages.map((pkg, i) => {
            const status  = pkgStatus(pkg, errors, i);
            const summary = pkgSummary(pkg);
            const isActive = i === safeIndex;
            return (
              <button
                key={i}
                type="button"
                data-idx={i}
                className={`psl-list-item${isActive ? ' psl-list-item--active' : ''}${status === 'error' ? ' psl-list-item--err' : ''}`}
                onClick={() => setActiveIndex(i)}
              >
                <div className="psl-list-item__badge" style={{
                  background: isActive ? 'var(--color-accent)' : status === 'ok' ? 'var(--color-success-bg)' : status === 'error' ? 'var(--color-error-bg)' : 'var(--color-bg-3)',
                  color: isActive ? '#fff' : status === 'ok' ? 'var(--color-success)' : status === 'error' ? 'var(--color-error)' : 'var(--color-text-subtle)',
                }}>
                  {status === 'ok' && !isActive ? '✓' : String(i + 1).padStart(2, '0')}
                </div>
                <div className="psl-list-item__info">
                  <span className="psl-list-item__name">
                    {summary || <span style={{ color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>{t.cgoEmptyPackage}</span>}
                  </span>
                  {status === 'error' && (
                    <span className="psl-list-item__err-hint">{t.cgoMissingFields}</span>
                  )}
                  {pkg.orderType !== 'Send' && (
                    <span className="psl-list-item__type-chip" style={{
                      color: pkg.orderType === 'Return' ? '#c0392b' : '#3b82f6'
                    }}>
                      {pkg.orderType}
                    </span>
                  )}
                </div>
                {status === 'error' && (
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--color-error)' }}>
                    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                    <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>

      </div>

      {/* ── Detail panel ── */}
      {packages.length > 0 && packages[safeIndex] && (
        <PackageDetail
          key={safeIndex}
          index={safeIndex}
          pkg={packages[safeIndex]}
          errors={errors}
          canRemove={packages.length > 1}
          customerPricing={customerPricing}
          weightTiers={weightTiers}
          senderAddress={senderAddress}
          pickupDistrictName={pickupDistrictName}
          districtLookup={districtLookup}
          serviceIncludedForced={serviceIncludedForced}
          allowReturn={allowReturn}
          onChange={onChange}
          onRemove={handleRemove}
          onPrev={() => setActiveIndex(safeIndex - 1)}
          onNext={() => setActiveIndex(safeIndex + 1)}
          hasPrev={safeIndex > 0}
          hasNext={safeIndex < packages.length - 1}
          total={packages.length}
        />
      )}

      <style>{`
        .psl-root {
          display: grid;
          grid-template-columns: 220px 1fr;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--color-bg-2);
          min-height: 500px;
        }

        /* ── Sidebar ── */
        .psl-sidebar {
          border-right: 1px solid var(--color-border);
          display: flex; flex-direction: column;
          background: var(--color-bg-3);
          overflow: hidden;
        }
        .psl-sidebar__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 12px; border-bottom: 1px solid var(--color-border);
          flex-shrink: 0;
        }
        .psl-sidebar__count { font-size: 0.78rem; font-weight: 600; color: var(--color-text); }
        .psl-sidebar__stats { display: flex; gap: 4px; }
        .psl-mini-pill { font-size: 0.7rem; font-weight: 700; padding: 1px 6px; border-radius: 99px; }
        .psl-mini-pill--ok  { background: var(--color-success-bg); color: var(--color-success); }
        .psl-mini-pill--err { background: var(--color-error-bg); color: var(--color-error); }

        .psl-sidebar__list { flex: 1; overflow-y: auto; }

        .psl-list-item {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 9px 12px; width: 100%; text-align: left;
          border: none; background: none; cursor: pointer;
          border-bottom: 1px solid var(--color-border);
          transition: background var(--transition);
          position: relative;
        }
        .psl-list-item:hover { background: var(--color-accent-dim); }
        .psl-list-item--active {
          background: var(--color-accent-dim);
        }
        .psl-list-item--active::before {
          content: ''; position: absolute; left: 0; top: 0; bottom: 0;
          width: 3px; background: var(--color-accent); border-radius: 0 2px 2px 0;
        }
        .psl-list-item--err { background: var(--color-error-bg); }
        .psl-list-item--err:hover { background: rgba(192,57,43,0.12); }

        .psl-list-item__badge {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 0.72rem; font-weight: 700;
        }
        .psl-list-item__info { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
        .psl-list-item__name {
          font-size: 0.8rem; font-weight: 500; color: var(--color-text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .psl-list-item__err-hint { font-size: 0.7rem; color: var(--color-error); }
        .psl-list-item__type-chip { font-size: 0.68rem; font-weight: 600; color: inherit; }

        /* ── Detail panel ── */
        .psl-detail {
          display: flex; flex-direction: column; overflow: hidden;
        }
        .psl-detail__header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 16px; border-bottom: 1px solid var(--color-border);
          flex-shrink: 0; gap: 12px; flex-wrap: wrap;
        }
        .psl-detail__title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .psl-detail__pkg-label { font-size: 0.88rem; font-weight: 700; color: var(--color-text); }
        .psl-type-chip {
          font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; padding: 2px 8px; border-radius: 99px;
        }
        .psl-status-tag { font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
        .psl-status-tag--ok  { background: var(--color-success-bg); color: var(--color-success); }
        .psl-status-tag--err { background: var(--color-error-bg); color: var(--color-error); }

        .psl-detail__nav { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .psl-nav-btn {
          width: 28px; height: 28px; border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg-3);
          color: var(--color-text-muted); cursor: pointer; display: flex;
          align-items: center; justify-content: center; transition: all var(--transition);
        }
        .psl-nav-btn:hover:not(:disabled) { border-color: var(--color-accent); color: var(--color-accent); }
        .psl-nav-btn:disabled { opacity: 0.35; cursor: default; }
        .psl-nav-pos { font-size: 0.78rem; color: var(--color-text-muted); min-width: 36px; text-align: center; }
        .psl-remove-btn {
          display: flex; align-items: center; gap: 5px;
          padding: 5px 12px; border: none;
          border-radius: var(--radius-sm); background: var(--color-accent);
          color: #ffffff; font-size: 0.78rem; font-weight: 600;
          cursor: pointer; transition: background var(--transition), box-shadow var(--transition);
          font-family: var(--font-body);
        }
        .psl-remove-btn:hover { background: #f0b040; box-shadow: 0 4px 20px var(--color-accent-glow); }

        .psl-detail__body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }

        /* Sections */
        .psl-section { display: flex; flex-direction: column; gap: 10px; }
        .psl-section--return {
          border: 1px solid rgba(192,57,43,0.25); border-radius: var(--radius-sm);
          padding: 12px 14px; background: rgba(192,57,43,0.04);
        }
        .psl-section__label {
          font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--color-text-muted);
          padding-bottom: 6px; border-bottom: 1px solid var(--color-border);
        }
        .psl-type-row { display: flex; gap: 6px; flex-wrap: wrap; }
        .psl-type-btn {
          padding: 6px 14px; border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg-3);
          color: var(--color-text-subtle); font-family: var(--font-body);
          font-size: 0.82rem; font-weight: 600; cursor: pointer;
          transition: all var(--transition);
        }
        .psl-type-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
        .psl-type-btn--active { font-weight: 700; }
        .psl-return-hint { font-size: 0.78rem; color: var(--color-text-muted); line-height: 1.5; }
        .psl-hint {
          display: flex; align-items: flex-start; gap: 8px;
          font-size: 0.8rem; padding: 10px 12px;
          border-radius: var(--radius-sm); line-height: 1.5;
        }
        .psl-hint--blue { color: #3b82f6; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.2); }
        .psl-grid { display: grid; gap: 10px; }
        .psl-grid--2 { grid-template-columns: 1fr 1fr; }

        /* Checkbox rows (fragile / all-in price) — these class names have no
           stylesheet of their own, so they live here with their only consumer. */
        .package-card__fragile-toggle {
          display: flex; align-items: center; gap: 9px;
          font-size: 0.85rem; color: var(--color-text);
          cursor: pointer; user-select: none;
          padding: 8px 10px; border-radius: var(--radius-sm);
          border: 1px solid var(--color-border); background: var(--color-bg-3);
          transition: border-color var(--transition), background var(--transition);
        }
        .package-card__fragile-toggle:hover { border-color: var(--color-accent); }
        .package-card__fragile-toggle input[type="checkbox"] {
          width: 18px; height: 18px; flex-shrink: 0;
          accent-color: var(--color-accent); cursor: pointer; margin: 0;
        }
        .package-card__fragile-icon { color: var(--color-accent); font-size: 0.95rem; }

        /* ── Mobile collapse toggle (hidden on desktop) ── */
        .psl-sidebar__toggle {
          display: none;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: none;
          cursor: pointer;
          color: var(--color-text-muted);
          border-radius: var(--radius-sm);
          transition: color var(--transition), background var(--transition);
          flex-shrink: 0;
          padding: 0;
          -webkit-tap-highlight-color: transparent;
        }
        .psl-sidebar__toggle:hover { color: var(--color-text); background: var(--color-bg); }

        @media (max-width: 640px) {
          .psl-root {
            grid-template-columns: 1fr;
            grid-template-rows: auto auto;
            min-height: 0;
            overflow: visible;
          }
          .psl-sidebar {
            border-right: none;
            border-bottom: 1px solid var(--color-border);
          }
          .psl-sidebar__list {
            max-height: 220px;
            overflow-y: auto;
            overflow-x: hidden;
            transition: max-height 0.25s ease, opacity 0.2s ease;
          }
          .psl-sidebar--collapsed .psl-sidebar__list {
            max-height: 0;
            opacity: 0;
            overflow: hidden;
          }
          .psl-sidebar__toggle {
            display: flex;
          }
          .psl-detail {
            overflow: visible;
          }
          .psl-detail__body {
            flex: none;
            overflow-y: visible;
            padding: 12px;
            gap: 16px;
          }
          /* Package navigation stays reachable while scrolling a long editor. */
          .psl-detail__header {
            position: sticky;
            top: var(--staff-nav-h, 0px);
            z-index: 4;
            background: var(--color-bg-2);
            padding: 8px 12px;
            gap: 8px;
          }
          .psl-detail__title { min-width: 0; }
          .psl-detail__pkg-label { font-size: 0.82rem; }
          .psl-nav-btn { width: 38px; height: 38px; }
          .psl-nav-pos { font-size: 0.82rem; min-width: 42px; }
          .psl-remove-btn { padding: 9px 12px; }
          .psl-grid--2 {
            grid-template-columns: 1fr;
          }
          /* Full-width segmented control instead of three small chips. */
          .psl-type-row { gap: 8px; }
          .psl-type-btn {
            flex: 1;
            min-height: 44px;
            padding: 10px 8px;
            font-size: 0.88rem;
          }
          .psl-list-item { padding: 11px 12px; }
          .psl-list-item__name { font-size: 0.85rem; }
          .psl-sidebar__toggle { width: 34px; height: 34px; }
          .package-card__fragile-toggle { padding: 11px 12px; font-size: 0.9rem; }
          .package-card__fragile-toggle input[type="checkbox"] { width: 20px; height: 20px; }
        }
      `}</style>
    </div>
  );
}
