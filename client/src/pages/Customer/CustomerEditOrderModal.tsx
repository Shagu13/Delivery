import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FormField } from '../../components/ui/FormField';
import { GeorgianPhoneField, sanitizeGeorgianMobile, isValidGeorgianMobile } from '../../components/ui/GeorgianPhoneField';
import { updateMyOrder, CustomerApiError } from '../../api/customers';
import type { CustomerOrder } from '../../api/customers';
import { useLanguage } from '../../contexts/useLanguage';

interface Props {
  order: CustomerOrder | null;
  open: boolean;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export function CustomerEditOrderModal({ order, open, token, onClose, onSaved }: Props) {
  const { lang, t } = useLanguage();

  const [name,        setName]        = useState('');
  const [phone,       setPhone]       = useState('');
  const [address,     setAddress]     = useState('');
  const [cod,         setCod]         = useState('');
  const [description, setDescription] = useState('');
  const [payer,       setPayer]       = useState<'Sender' | 'Recipient'>('Sender');
  const [payStatus,   setPayStatus]   = useState<'NotPaid' | 'Paid'>('NotPaid');

  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate when the target order changes
  useEffect(() => {
    if (!order) return;
    setName(order.recipientName);
    setPhone(sanitizeGeorgianMobile(order.recipientPhone));
    setAddress(order.recipientAddress);
    // For "service included" orders the customer works with the all-in price, so show
    // product COD + service fee in the single field (the backend re-splits on save).
    const fee = order.companyServicePrice ?? 0;
    const shownCod = order.isCompanyServicePriceIncluded
      ? (order.amountToCollectForPackage ?? 0) + fee
      : order.amountToCollectForPackage;
    setCod(shownCod != null ? String(shownCod) : '');
    setDescription(order.description ?? '');
    setPayer(order.whoPaysForCompanyService ?? 'Sender');
    setPayStatus(order.productPaymentStatus);
    setError(null);
    setErrors({});
  }, [order]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open || !order) return null;

  const isUnpaid = payStatus === 'NotPaid';
  const cityName     = lang === 'ka' && order.recipientCityGeo     ? order.recipientCityGeo     : order.recipientCity;
  const districtName = lang === 'ka' && order.recipientDistrictGeo ? order.recipientDistrictGeo : order.recipientDistrict;

  const clearErr = (field: string) => setErrors(prev => {
    if (!prev[field]) return prev;
    const next = { ...prev };
    delete next[field];
    return next;
  });

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    // Recipient name is optional — blank stores "" and renders as "Unknown"/"უცნობი".
    if (!phone.trim())     e.recipientPhone     = t.errPhoneRequired;
    else if (!isValidGeorgianMobile(phone)) e.recipientPhone = t.cgoErrInvalidPhone;
    if (!address.trim())   e.recipientAddress   = t.errAddressRequired;
    // COD is required and must be > 0 for unpaid parcels — mirrors the create form.
    if (isUnpaid) {
      const n = parseFloat(cod);
      if (!cod.trim() || isNaN(n) || n <= 0) e.amountToCollectForPackage = t.cgoErrParcelPrice;
      // All-in price must cover the service fee that the backend deducts.
      else if (order.isCompanyServicePriceIncluded && n < (order.companyServicePrice ?? 0))
        e.amountToCollectForPackage = t.cgoErrPriceBelowFee;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyOrder(order.id, {
        recipientName:      name.trim(),
        recipientPhone:     phone.trim(),
        recipientAddress:   address.trim(),
        amountToCollectForPackage: isUnpaid && cod.trim() ? parseFloat(cod) : null,
        description:        description.trim() || null,
        whoPaysForCompanyService: isUnpaid ? 'Recipient' : payer,
        productPaymentStatus: payStatus,
      }, token);
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof CustomerApiError && e.errors) {
        const mapped: Record<string, string> = {};
        Object.entries(e.errors).forEach(([k, msgs]) => { mapped[k.charAt(0).toLowerCase() + k.slice(1)] = msgs[0]; });
        setErrors(mapped);
      }
      setError(e instanceof Error ? e.message : t.ceoSaveError);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <>
      <div className="ceo-backdrop" onClick={onClose} />
      <div className="ceo-modal" role="dialog" aria-modal="true" aria-labelledby="ceo-title">
        <div className="ceo-header">
          <h2 className="ceo-title" id="ceo-title">
            <span className="ceo-tn">{order.trackingNumber}</span>
            {t.ceoTitle}
          </h2>
          <button className="ceo-close" onClick={onClose} aria-label={t.cancel}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ceo-body">
          {error && <div className="ceo-error">{error}</div>}

          {/* Delivery location is fixed here */}
          <div className="ceo-location">
            <span className="ceo-location__label">{t.ceoLocationLabel}</span>
            <span className="ceo-location__value">{cityName}, {districtName}</span>
          </div>

          <FormField
            label={t.cgoRecipientName}
            value={name}
            onChange={e => { setName(e.target.value); clearErr('recipientName'); }}
            error={errors.recipientName}
            maxLength={200}
          />

          <GeorgianPhoneField
            label={t.ceoPhone} required
            value={phone}
            onValueChange={v => { setPhone(v); clearErr('recipientPhone'); }}
            error={errors.recipientPhone}
            invalidMessage={t.cgoErrInvalidPhone}
          />

          <FormField
            label={t.ceoAddress} required
            value={address}
            onChange={e => { setAddress(e.target.value); clearErr('recipientAddress'); }}
            error={errors.recipientAddress}
            placeholder={t.cgoStreetPlaceholder} maxLength={250}
          />

          {/* The customer may correct a mismarked payment status (e.g. picked "Paid" by
              mistake at checkout). Switching to Paid clears the COD amount; switching to
              Not Paid forces the service-fee payer to Recipient and requires a COD amount. */}
          <div className="form-field">
            <label className="form-field__label">{t.eomPayStatus}</label>
            <select
              className="form-field__input"
              value={payStatus}
              onChange={e => {
                const next = e.target.value as 'NotPaid' | 'Paid';
                setPayStatus(next);
                if (next === 'Paid') { setCod(''); clearErr('amountToCollectForPackage'); }
              }}
            >
              <option value="NotPaid">{t.eomUnpaid}</option>
              <option value="Paid">{t.eomPaid}</option>
            </select>
          </div>

          {/* All-in price is fixed at whatever the order was created with — the split
              between product COD and service fee doesn't change here, only the amount. */}
          {isUnpaid && order.isCompanyServicePriceIncluded && (
            <FormField
              label={t.cgoPriceAllIn} type="number"
              value={cod}
              onChange={e => { setCod(e.target.value); clearErr('amountToCollectForPackage'); }}
              error={errors.amountToCollectForPackage}
              placeholder="0.00"
            />
          )}

          {/* Not bundled: parcel price + company service fee shown side by side, and a
              read-only total below — same layout as the create-order form. The fee itself
              isn't editable here (it's resolved by the pricing waterfall, not a customer
              input), it's shown so the customer can see what's being collected. */}
          {isUnpaid && !order.isCompanyServicePriceIncluded && (
            <>
              <div className="ceo-grid">
                <FormField
                  label={t.cgoParcelPrice} type="number"
                  value={cod}
                  onChange={e => { setCod(e.target.value); clearErr('amountToCollectForPackage'); }}
                  error={errors.amountToCollectForPackage}
                  placeholder="0.00"
                />
                <div className="form-field">
                  <label className="form-field__label">{t.cgoServiceFee}</label>
                  <input
                    type="number" readOnly className="form-field__input"
                    style={{ background: 'var(--color-bg-3)', cursor: 'default', color: 'var(--color-accent)', fontWeight: 600 }}
                    value={order.companyServicePrice ?? ''}
                    placeholder={t.cgoServiceFeePlaceholder}
                  />
                  {/* Unpaid parcels always bill the fee to the recipient at delivery
                      (forced above), regardless of the order's original payer. */}
                  <p className="form-field__hint">{t.cgoServiceFeeHintRecipient}</p>
                </div>
              </div>
              <p className="form-field__hint" style={{ margin: '-8px 0 0' }}>{t.cgoParcelHint}</p>

              <div className="form-field">
                <label className="form-field__label">{t.cgoTotalPrice}</label>
                <input
                  type="number" readOnly className="form-field__input"
                  style={{ background: 'var(--color-bg-3)', cursor: 'default', color: 'var(--color-text)', fontWeight: 700 }}
                  value={((parseFloat(cod) || 0) + (order.companyServicePrice ?? 0)).toFixed(2)}
                />
                <p className="form-field__hint">{t.cgoTotalPriceHint}</p>
              </div>
            </>
          )}

          {/* Hidden for unpaid (COD) parcels — the recipient always pays the courier fee
              at delivery, same rule as the create-order form. Only a choice when already paid. */}
          {!isUnpaid && (
            <div className="form-field">
              <label className="form-field__label">{t.cgoWhoPays}</label>
              <select className="form-field__input" value={payer} onChange={e => setPayer(e.target.value as 'Sender' | 'Recipient')}>
                <option value="Sender">{t.cgoSender}</option>
                <option value="Recipient">{t.cgoRecipientPayer}</option>
              </select>
            </div>
          )}

          <FormField
            as="textarea"
            label={`${t.cgoPackageDescription} ${t.cgoDescOptional}`}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t.cgoDescPlaceholder}
            maxLength={500}
          />
        </div>

        <div className="ceo-footer">
          <button type="button" className="ceo-btn ceo-btn--cancel" onClick={onClose} disabled={saving}>
            {t.cancel}
          </button>
          <button type="button" className="ceo-btn ceo-btn--save" onClick={handleSave} disabled={saving}>
            {saving ? t.ceoSaving : t.ceoSave}
          </button>
        </div>
      </div>

      <style>{`
        .ceo-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);z-index:100;animation:ceo-fade 0.18s ease both; }
        .ceo-modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;width:min(520px,calc(100vw - 32px));max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22);animation:ceo-slide 0.22s ease both; }
        .ceo-header { display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid var(--color-border); }
        .ceo-title { font-family:var(--font-display);font-size:1.05rem;font-weight:800;color:var(--color-text);margin:0;display:flex;align-items:center;gap:10px; }
        .ceo-tn { font-family:'Courier New',monospace;font-size:0.78rem;font-weight:700;color:var(--color-accent);background:var(--color-accent-dim);padding:3px 8px;border-radius:var(--radius-sm); }
        .ceo-close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted); }
        .ceo-close:hover { background:var(--color-border); }
        .ceo-body { padding:18px 22px;display:flex;flex-direction:column;gap:14px; }
        .ceo-error { background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:#ef4444;font-size:0.82rem;padding:10px 14px; }
        .ceo-location { display:flex;flex-direction:column;gap:2px;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:10px 12px; }
        .ceo-location__label { font-size:0.68rem;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:var(--color-text-subtle); }
        .ceo-location__value { font-size:0.9rem;font-weight:600;color:var(--color-text); }
        .ceo-location__hint { font-size:0.74rem;color:var(--color-text-subtle); }
        .ceo-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
        .form-field__hint { font-size:0.75rem;color:var(--color-text-subtle);margin-top:4px; }
        .ceo-footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--color-border); }
        .ceo-btn { padding:10px 20px;border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;cursor:pointer;font-family:var(--font-body); }
        .ceo-btn:disabled { opacity:0.6;cursor:not-allowed; }
        .ceo-btn--cancel { background:transparent;border:1px solid var(--color-border);color:var(--color-text-muted); }
        .ceo-btn--cancel:hover:not(:disabled) { background:var(--color-bg-3); }
        .ceo-btn--save { background:var(--color-accent);border:none;color:#fff; }
        .ceo-btn--save:hover:not(:disabled) { background:#d4891a; }
        @keyframes ceo-fade { from{opacity:0} to{opacity:1} }
        @keyframes ceo-slide { from{opacity:0;transform:translate(-50%,calc(-50% + 12px))} to{opacity:1;transform:translate(-50%,-50%)} }
        @media (max-width:480px){ .ceo-grid{grid-template-columns:1fr;} }
      `}</style>
    </>,
    document.body
  );
}
