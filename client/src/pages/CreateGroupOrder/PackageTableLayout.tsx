import { useState, useCallback, useRef } from 'react';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
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
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
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

function computeFee(
  district: District,
  tierId: string | undefined,
  weightTiers: WeightPriceTier[],
  customerPricing?: CustomerPricing | null
): number {
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
    if (district.isCapitalTerritory && (customerPricing.companyServiceCapitalPrice ?? 0) > 0)
      return customerPricing.companyServiceCapitalPrice!;
    if (district.isCityTerritory && (customerPricing.companyServiceCityPrice ?? 0) > 0)
      return customerPricing.companyServiceCityPrice!;
    if ((customerPricing.companyServiceDistrictPrice ?? 0) > 0)
      return customerPricing.companyServiceDistrictPrice!;
  }
  return district.companyServicePrice ?? 0;
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  index: number;
  pkg: OrderItemRequest;
  errors: ValidationErrors;
  canRemove: boolean;
  customerPricing?: CustomerPricing | null;
  weightTiers: WeightPriceTier[];
  senderAddress?: { city: string; district: string; address: string } | null;
  onChange: (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => void;
  onRemove: (index: number) => void;
  isExpanded: boolean;
  onToggleExpand: (i: number) => void;
}

function PackageRow({
  index, pkg, errors, canRemove, customerPricing, weightTiers,
  senderAddress, onChange, onRemove, isExpanded, onToggleExpand,
}: RowProps) {
  const { t } = useLanguage();
  const status = pkgStatus(pkg, errors, index);
  const fe = (f: string) => errors[`orders[${index}].${f}`];

  const handleDistrictSelect = useCallback((district: District | null) => {
    if (district) {
      const fee = computeFee(district, pkg.weightPriceTierId, weightTiers, customerPricing);
      onChange(index, 'companyServicePrice', fee);
    } else {
      onChange(index, 'companyServicePrice', 0);
    }
  }, [index, pkg.weightPriceTierId, weightTiers, customerPricing, onChange]);

  const handleReturnDistrictSelect = useCallback((district: District | null) => {
    if (district) {
      const fee = computeFee(district, pkg.weightPriceTierId, weightTiers, customerPricing);
      onChange(index, 'companyServicePrice', fee);
    }
  }, [index, pkg.weightPriceTierId, weightTiers, customerPricing, onChange]);

  const handleOrderTypeChange = (type: OrderType) => {
    onChange(index, 'orderType', type);
    onChange(index, 'companyServicePrice', 0);
    if (type === 'Return') {
      onChange(index, 'whoPaysForCompanyService', 'Sender');
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
    if (val === 'NotPaid') onChange(index, 'whoPaysForCompanyService', 'Recipient');
    else onChange(index, 'amountToCollectForPackage', 0);
  };

  const isReturn   = pkg.orderType === 'Return';
  const isExpand   = isExpanded;
  const showCOD    = pkg.productPaymentStatus === 'NotPaid';
  const rowHasErr  = status === 'error';

  const dotColor = status === 'ok' ? '#1e7e5a' : status === 'error' ? '#c0392b' : '#a8a19a';

  return (
    <>
      {/* ── Main row ── */}
      <tr className={`ptl-tr${rowHasErr ? ' ptl-tr--err' : ''}`}>
        {/* # */}
        <td className="ptl-td ptl-td--num">
          <span className="ptl-dot" style={{ background: dotColor }} />
          <span className="ptl-num">{String(index + 1).padStart(2, '0')}</span>
        </td>

        {/* First + Last */}
        <td className="ptl-td">
          <div className="ptl-name-pair">
            <input
              className={`ptl-inp${fe('recipientFirstName') ? ' ptl-inp--err' : ''}`}
              placeholder={t.cgoRecipientFNPlaceholder}
              value={pkg.recipientFirstName}
              onChange={e => onChange(index, 'recipientFirstName', e.target.value)}
              maxLength={100}
            />
            <input
              className={`ptl-inp${fe('recipientLastName') ? ' ptl-inp--err' : ''}`}
              placeholder={t.cgoRecipientLNPlaceholder}
              value={pkg.recipientLastName}
              onChange={e => onChange(index, 'recipientLastName', e.target.value)}
              maxLength={100}
            />
          </div>
        </td>

        {/* Phone */}
        <td className="ptl-td">
          <input
            className={`ptl-inp${fe('recipientPhone') ? ' ptl-inp--err' : ''}`}
            placeholder="5XX XXX XXX"
            type="tel"
            value={pkg.recipientPhone}
            onChange={e => onChange(index, 'recipientPhone', e.target.value)}
            maxLength={9}
          />
          {fe('recipientPhone') && <div className="ptl-err-msg">{fe('recipientPhone')}</div>}
        </td>

        {/* City / District picker */}
        <td className="ptl-td ptl-td--cdp">
          <CityDistrictPicker
            cityValue={pkg.recipientCity}
            districtValue={pkg.recipientDistrict}
            onCityChange={v => { onChange(index, 'recipientCity', v); onChange(index, 'recipientDistrict', ''); onChange(index, 'companyServicePrice', 0); }}
            onDistrictChange={v => onChange(index, 'recipientDistrict', v)}
            onDistrictSelect={handleDistrictSelect}
            cityError={fe('recipientCity')}
            districtError={fe('recipientDistrict')}
          />
        </td>

        {/* Address */}
        <td className="ptl-td">
          <input
            className={`ptl-inp${fe('recipientAddress') ? ' ptl-inp--err' : ''}`}
            placeholder={t.cgoStreetPlaceholder}
            value={pkg.recipientAddress}
            onChange={e => onChange(index, 'recipientAddress', e.target.value)}
            maxLength={250}
          />
          {fe('recipientAddress') && <div className="ptl-err-msg">{fe('recipientAddress')}</div>}
        </td>

        {/* Type */}
        <td className="ptl-td ptl-td--type">
          <div className="ptl-type-btns">
            {(['Send', 'Return', 'Exchange'] as OrderType[]).map(tp => (
              <button
                key={tp}
                type="button"
                className={`ptl-type-btn${pkg.orderType === tp ? ' ptl-type-btn--active' : ''}`}
                onClick={() => handleOrderTypeChange(tp)}
              >
                {tp === 'Send'     && (t.cgoOrderTypeSend     ?? 'Send')}
                {tp === 'Return'   && (t.cgoOrderTypeReturn   ?? 'Return')}
                {tp === 'Exchange' && (t.cgoOrderTypeExchange ?? 'Exchange')}
              </button>
            ))}
          </div>
        </td>

        {/* Payment */}
        <td className="ptl-td ptl-td--pay">
          <select
            className="ptl-sel"
            value={pkg.productPaymentStatus}
            onChange={e => handlePaymentStatusChange(e.target.value)}
          >
            <option value="NotPaid">{t.cgoNotPaid}</option>
            <option value="Paid">{t.cgoPaid}</option>
          </select>
        </td>

        {/* COD amount — shown inline when NotPaid */}
        <td className="ptl-td ptl-td--cod">
          {showCOD ? (
            <div className="ptl-amount-wrap">
              <span className="ptl-currency">₾</span>
              <input
                className={`ptl-inp ptl-inp--num${fe('amountToCollectForPackage') ? ' ptl-inp--err' : ''}`}
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={pkg.amountToCollectForPackage ?? ''}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  onChange(index, 'amountToCollectForPackage', isNaN(v) ? 0 : v);
                }}
              />
            </div>
          ) : (
            <span className="ptl-na">—</span>
          )}
          {fe('amountToCollectForPackage') && <div className="ptl-err-msg">{fe('amountToCollectForPackage')}</div>}
        </td>

        {/* Expand / Remove */}
        <td className="ptl-td ptl-td--actions">
          <button
            type="button"
            className={`ptl-expand-btn${isExpand ? ' ptl-expand-btn--open' : ''}`}
            onClick={() => onToggleExpand(index)}
            title="More options"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {canRemove && (
            <button
              type="button"
              className="ptl-remove-btn"
              onClick={() => onRemove(index)}
              title={t.cgoRemove}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </td>
      </tr>

      {/* ── Expanded detail row ── */}
      {isExpand && (
        <tr className="ptl-detail-row">
          <td colSpan={9} className="ptl-detail-td">
            <div className="ptl-detail-grid">

              {/* Weight tier */}
              {weightTiers.length > 0 && (
                <div className="ptl-detail-field">
                  <label className="ptl-detail-label">{t.cgoWeightTier}</label>
                  <select
                    className="ptl-sel"
                    value={pkg.weightPriceTierId ?? ''}
                    onChange={e => {
                      onChange(index, 'weightPriceTierId', e.target.value);
                      // recompute fee if district known
                    }}
                  >
                    <option value="">{t.cgoWeightTierPlaceholder}</option>
                    {weightTiers.map(tier => (
                      <option key={tier.id} value={tier.id}>{tierLabel(tier)}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Who pays */}
              <div className="ptl-detail-field">
                <label className="ptl-detail-label">{t.cgoWhoPays}</label>
                <select
                  className="ptl-sel"
                  value={pkg.whoPaysForCompanyService}
                  onChange={e => onChange(index, 'whoPaysForCompanyService', e.target.value)}
                >
                  <option value="Recipient">{t.cgoRecipientPayer}</option>
                  <option value="Sender">{t.cgoSender}</option>
                </select>
              </div>

              {/* Service fee (read-only display) */}
              <div className="ptl-detail-field">
                <label className="ptl-detail-label">{t.cgoServiceFee}</label>
                <div className="ptl-svc-fee">
                  {pkg.companyServicePrice ? `₾${pkg.companyServicePrice.toFixed(2)}` : <span style={{ color: 'var(--color-text-subtle)' }}>{t.cgoServiceFeePlaceholder}</span>}
                </div>
              </div>

              {/* Description */}
              <div className="ptl-detail-field ptl-detail-field--wide">
                <label className="ptl-detail-label">{t.cgoPackageDescription}</label>
                <input
                  className="ptl-inp"
                  placeholder={t.cgoDescPlaceholder}
                  value={pkg.description ?? ''}
                  onChange={e => onChange(index, 'description', e.target.value)}
                  maxLength={500}
                />
              </div>

              {/* Fragile */}
              <div className="ptl-detail-field ptl-detail-field--check">
                <label className="ptl-fragile-label">
                  <input
                    type="checkbox"
                    checked={pkg.isFragile}
                    onChange={e => onChange(index, 'isFragile', e.target.checked)}
                  />
                  <span>⚠ {t.cgoFragile}</span>
                </label>
              </div>

              {/* Return pickup address — only for Return type */}
              {isReturn && (
                <div className="ptl-detail-field ptl-detail-field--return">
                  <div className="ptl-return-header">
                    <span style={{ color: '#c0392b', fontWeight: 600, fontSize: '0.8rem' }}>
                      {t.cgoReturnPickupAddress ?? '📍 Return Pickup Address'}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                      {t.cgoReturnPickupHint ?? 'Where courier will collect the parcel from the recipient'}
                    </span>
                  </div>
                  <CityDistrictPicker
                    cityValue={pkg.returnPickupCity ?? ''}
                    districtValue={pkg.returnPickupDistrict ?? ''}
                    onCityChange={v => { onChange(index, 'returnPickupCity', v); onChange(index, 'returnPickupDistrict', ''); onChange(index, 'companyServicePrice', 0); }}
                    onDistrictChange={v => onChange(index, 'returnPickupDistrict', v)}
                    onDistrictSelect={handleReturnDistrictSelect}
                    cityError={fe('returnPickupCity')}
                    districtError={fe('returnPickupDistrict')}
                  />
                  <input
                    className={`ptl-inp${fe('returnPickupAddress') ? ' ptl-inp--err' : ''}`}
                    placeholder={t.cgoStreetPlaceholder}
                    value={pkg.returnPickupAddress ?? ''}
                    onChange={e => onChange(index, 'returnPickupAddress', e.target.value)}
                    maxLength={250}
                    style={{ marginTop: 8 }}
                  />
                  {fe('returnPickupAddress') && <div className="ptl-err-msg">{fe('returnPickupAddress')}</div>}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main table component ──────────────────────────────────────────────────────

export function PackageTableLayout({ packages, errors, customerPricing, weightTiers = [], senderAddress, onChange, onRemove, onAdd }: Props) {
  const { t } = useLanguage();
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleExpand = (i: number) => setExpandedRows(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const readyCount = packages.filter((p, i) => pkgStatus(p, errors, i) === 'ok').length;
  const errorCount = packages.filter((p, i) => pkgStatus(p, errors, i) === 'error').length;

  return (
    <div className="ptl-root">
      {/* Status bar */}
      <div className="ptl-statusbar">
        <span className="ptl-statusbar__count">{packages.length} {t.cgoFooterCount ? '' : 'packages'}{t.cgoFooterCount ? t.cgoFooterCount(packages.length) : ''}</span>
        <div className="ptl-statusbar__pills">
          {readyCount > 0 && (
            <span className="ptl-pill ptl-pill--ok">
              <span className="ptl-dot ptl-dot--sm" style={{ background: '#1e7e5a' }} />
              {readyCount} ready
            </span>
          )}
          {errorCount > 0 && (
            <span className="ptl-pill ptl-pill--err">
              <span className="ptl-dot ptl-dot--sm" style={{ background: '#c0392b' }} />
              {errorCount} need attention
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="ptl-wrap">
        <table className="ptl-table">
          <thead>
            <tr className="ptl-thead-tr">
              <th className="ptl-th ptl-th--num">#</th>
              <th className="ptl-th">Name</th>
              <th className="ptl-th ptl-th--phone">Phone</th>
              <th className="ptl-th ptl-th--cdp">City / District</th>
              <th className="ptl-th">Address</th>
              <th className="ptl-th ptl-th--type">Type</th>
              <th className="ptl-th ptl-th--pay">Payment</th>
              <th className="ptl-th ptl-th--cod">COD ₾</th>
              <th className="ptl-th ptl-th--actions"></th>
            </tr>
          </thead>
          <tbody>
            {packages.map((pkg, i) => (
              <PackageRow
                key={i}
                index={i}
                pkg={pkg}
                errors={errors}
                canRemove={packages.length > 1}
                customerPricing={customerPricing}
                weightTiers={weightTiers}
                senderAddress={senderAddress}
                onChange={onChange}
                onRemove={onRemove}
                isExpanded={expandedRows.has(i)}
                onToggleExpand={toggleExpand}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Add row */}
      {packages.length < 100 && (
        <button type="button" className="ptl-add-btn" onClick={onAdd}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          {t.cgoAddPackage}
        </button>
      )}

      <style>{`
        .ptl-root { display: flex; flex-direction: column; gap: 0; }

        .ptl-statusbar {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; background: var(--color-bg-2);
          border: 1px solid var(--color-border); border-bottom: none;
          border-radius: var(--radius-md) var(--radius-md) 0 0;
          font-size: 0.8rem;
        }
        .ptl-statusbar__count { font-weight: 600; color: var(--color-text); }
        .ptl-statusbar__pills { display: flex; gap: 8px; }
        .ptl-pill { display: flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 500; padding: 2px 8px; border-radius: 99px; }
        .ptl-pill--ok  { background: var(--color-success-bg); color: var(--color-success); }
        .ptl-pill--err { background: var(--color-error-bg); color: var(--color-error); }
        .ptl-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
        .ptl-dot--sm { width: 6px; height: 6px; }

        .ptl-wrap { overflow-x: auto; border: 1px solid var(--color-border); }
        .ptl-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; table-layout: fixed; }

        .ptl-thead-tr { background: var(--color-bg-3); }
        .ptl-th {
          padding: 8px 8px; text-align: left; font-size: 0.73rem; font-weight: 600;
          color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em;
          border-bottom: 1px solid var(--color-border); white-space: nowrap;
        }
        .ptl-th--num     { width: 52px; }
        .ptl-th--phone   { width: 110px; }
        .ptl-th--cdp     { width: 260px; }
        .ptl-th--type    { width: 180px; }
        .ptl-th--pay     { width: 100px; }
        .ptl-th--cod     { width: 90px; }
        .ptl-th--actions { width: 64px; }

        .ptl-tr { background: var(--color-bg-2); transition: background 100ms; }
        .ptl-tr:hover { background: var(--color-accent-dim); }
        .ptl-tr--err { background: var(--color-error-bg) !important; }
        .ptl-tr + .ptl-tr { border-top: 1px solid var(--color-border); }

        .ptl-td { padding: 7px 8px; vertical-align: top; }
        .ptl-td--num { vertical-align: middle; }
        .ptl-td--cdp { padding: 4px 8px; }
        .ptl-td--type { vertical-align: middle; }
        .ptl-td--pay { vertical-align: middle; }
        .ptl-td--cod { vertical-align: middle; }
        .ptl-td--actions { vertical-align: middle; }

        .ptl-num { font-size: 0.75rem; font-weight: 600; color: var(--color-text-subtle); margin-left: 4px; }

        .ptl-name-pair { display: flex; gap: 4px; }

        .ptl-inp {
          width: 100%; padding: 5px 7px;
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-bg-2); color: var(--color-text);
          font-family: var(--font-body); font-size: 0.82rem;
          outline: none; transition: border-color var(--transition);
        }
        .ptl-inp:focus { border-color: var(--color-accent); box-shadow: var(--shadow-focus); }
        .ptl-inp--err { border-color: var(--color-error); }
        .ptl-inp--num { width: 70px; }

        .ptl-sel {
          width: 100%; padding: 5px 7px;
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-bg-2); color: var(--color-text);
          font-family: var(--font-body); font-size: 0.82rem; cursor: pointer;
          outline: none;
        }
        .ptl-sel:focus { border-color: var(--color-accent); }

        .ptl-type-btns { display: flex; gap: 3px; flex-wrap: wrap; }
        .ptl-type-btn {
          padding: 3px 8px; border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg-3);
          color: var(--color-text-subtle); font-size: 0.73rem; font-weight: 600;
          cursor: pointer; transition: all var(--transition); white-space: nowrap;
        }
        .ptl-type-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
        .ptl-type-btn--active { background: var(--color-accent-dim); border-color: var(--color-accent); color: var(--color-accent); }

        .ptl-amount-wrap { display: flex; align-items: center; gap: 3px; }
        .ptl-currency { font-size: 0.75rem; color: var(--color-text-muted); flex-shrink: 0; }
        .ptl-na { color: var(--color-text-subtle); font-size: 0.8rem; }

        .ptl-expand-btn {
          width: 26px; height: 26px; border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg-3);
          color: var(--color-text-muted); cursor: pointer; display: inline-flex;
          align-items: center; justify-content: center; transition: all var(--transition);
        }
        .ptl-expand-btn:hover { border-color: var(--color-accent); color: var(--color-accent); }
        .ptl-expand-btn--open { background: var(--color-accent-dim); border-color: var(--color-accent); color: var(--color-accent); }
        .ptl-expand-btn--open svg { transform: rotate(180deg); }
        .ptl-expand-btn svg { transition: transform var(--transition); }

        .ptl-remove-btn {
          width: 26px; height: 26px; border: 1px solid transparent;
          border-radius: var(--radius-sm); background: none;
          color: var(--color-text-subtle); cursor: pointer; display: inline-flex;
          align-items: center; justify-content: center; margin-left: 3px;
          transition: all var(--transition);
        }
        .ptl-remove-btn:hover { background: var(--color-error-bg); color: var(--color-error); border-color: var(--color-error); }

        .ptl-err-msg { font-size: 0.72rem; color: var(--color-error); margin-top: 2px; }

        /* Detail expansion row */
        .ptl-detail-row { background: var(--color-bg-3); }
        .ptl-detail-row + .ptl-tr { border-top: 1px solid var(--color-border); }
        .ptl-detail-td { padding: 12px 16px; border-top: 1px dashed var(--color-border); border-bottom: 1px solid var(--color-border); }
        .ptl-detail-grid { display: flex; flex-wrap: wrap; gap: 12px; }
        .ptl-detail-field { display: flex; flex-direction: column; gap: 4px; min-width: 160px; }
        .ptl-detail-field--wide { flex: 1 1 240px; }
        .ptl-detail-field--check { justify-content: flex-end; padding-bottom: 2px; }
        .ptl-detail-field--return { flex: 1 1 100%; border-top: 1px dashed rgba(192,57,43,0.2); padding-top: 10px; margin-top: 4px; }
        .ptl-detail-label { font-size: 0.73rem; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
        .ptl-return-header { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        .ptl-svc-fee { padding: 5px 7px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-3); font-size: 0.82rem; font-weight: 600; color: var(--color-accent); }
        .ptl-fragile-label { display: flex; align-items: center; gap: 6px; font-size: 0.82rem; cursor: pointer; }

        /* Add button */
        .ptl-add-btn {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 16px; width: 100%;
          border: 1px dashed var(--color-border); border-top: none;
          border-radius: 0 0 var(--radius-md) var(--radius-md);
          background: var(--color-bg-2); color: var(--color-text-muted);
          font-family: var(--font-body); font-size: 0.82rem; font-weight: 500;
          cursor: pointer; transition: all var(--transition);
        }
        .ptl-add-btn:hover { background: var(--color-accent-dim); color: var(--color-accent); border-color: var(--color-accent); }

        /* Override CityDistrictPicker to be compact inside table */
        .ptl-td--cdp .cdp-row { gap: 4px; }
        .ptl-td--cdp .cdp-field { flex: 1; }
        .ptl-td--cdp .cdp-control { min-height: unset; }
        .ptl-td--cdp .cdp-input { padding: 5px 7px; font-size: 0.8rem; }
        .ptl-td--cdp .cdp-label { font-size: 0.7rem; }
      `}</style>
    </div>
  );
}
