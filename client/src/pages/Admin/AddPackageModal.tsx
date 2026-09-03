import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import { GeorgianPhoneField, isValidGeorgianMobile } from '../../components/ui/GeorgianPhoneField';
import { getCustomers, getCustomerById } from '../../api/customers';
import type { AdminCustomer } from '../../api/customers';
import type { District } from '../../api/cities';
import { resolveServicePrice, type CustomerServicePricing } from './EditOrderModal';
import {
  createWalkInOrder, WalkInOrderError,
  type WalkInPackageInput, type CreateWalkInOrderResult,
} from '../../api/adminGroupOrders';
import '../../components/ui/Modal.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateWalkInOrderResult) => void;
}

interface CustForm {
  firstName: string; lastName: string; idNumber: string; businessName: string;
  phoneNumber: string; city: string; district: string; address: string;
}
const EMPTY_CUST: CustForm = {
  firstName: '', lastName: '', idNumber: '', businessName: '',
  phoneNumber: '', city: '', district: '', address: '',
};

type OrderType = 'Send' | 'Return' | 'Exchange';

interface PkgRow {
  orderType: OrderType;
  recipientName: string;
  recipientPhone: string;
  recipientCity: string;
  recipientDistrict: string;
  /** The picked district object — kept so the fee can be re-resolved if the customer changes. */
  recipientDistrictObj: District | null;
  recipientAddress: string;
  description: string;
  isFragile: boolean;
  payStatus: 'NotPaid' | 'Paid';
  payer: 'Sender' | 'Recipient';
  codAmount: string;
  svcPrice: string;
  svcIncluded: boolean;
  returnCity: string;
  returnDistrict: string;
  returnAddress: string;
}
const emptyPkg = (): PkgRow => ({
  orderType: 'Send',
  recipientName: '', recipientPhone: '', recipientCity: '', recipientDistrict: '', recipientDistrictObj: null, recipientAddress: '',
  description: '', isFragile: false,
  payStatus: 'NotPaid', payer: 'Sender',
  codAmount: '', svcPrice: '', svcIncluded: false,
  returnCity: '', returnDistrict: '', returnAddress: '',
});

type PkgErrors = Partial<Record<keyof PkgRow, string>>;

export function AddPackageModal({ open, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const { t } = useLanguage();

  const [cust, setCust]       = useState<CustForm>(EMPTY_CUST);
  const [selected, setSelected] = useState<AdminCustomer | null>(null);
  const [custErrors, setCustErrors] = useState<Partial<Record<keyof CustForm, string>>>({});
  // Negotiated tiers + per-district special prices for a locked-in existing customer.
  // Null → new customer / not loaded yet → the district's own default price is used.
  const [custPricing, setCustPricing] = useState<CustomerServicePricing | null>(null);

  const [suggestFor, setSuggestFor] = useState<null | 'idNumber' | 'phoneNumber'>(null);
  const [results, setResults]       = useState<AdminCustomer[]>([]);
  const [searching, setSearching]   = useState(false);

  const [pkgs, setPkgs]         = useState<PkgRow[]>([emptyPkg()]);
  const [pkgErrors, setPkgErrors] = useState<PkgErrors[]>([{}]);

  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  const blurTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    setCust(EMPTY_CUST); setSelected(null); setCustErrors({}); setCustPricing(null);
    setSuggestFor(null); setResults([]);
    setPkgs([emptyPkg()]); setPkgErrors([{}]);
    setApiError(null); setLoading(false);
  }, [open]);

  // Load the locked-in customer's negotiated pricing (tiers + per-district special prices)
  // so selecting a delivery district auto-fills the fee. New customers stay on null → the
  // district's own default price is used (still editable by the admin).
  useEffect(() => {
    if (!open || !token || !selected) { setCustPricing(null); return; }
    let cancelled = false;
    getCustomerById(selected.id, token)
      .then(c => {
        if (cancelled) return;
        setCustPricing({
          capital:  c.companyServiceCapitalPrice,
          city:     c.companyServiceCityPrice,
          district: c.companyServiceDistrictPrice,
          specialPrices: (c.specialPrices ?? []).map(s => ({
            id: s.districtId, districtId: s.districtId,
            districtName: '', districtNameGeo: null, cityName: '', price: s.price,
          })),
        });
      })
      .catch(() => { if (!cancelled) setCustPricing(null); });
    return () => { cancelled = true; };
  }, [open, token, selected]);

  // Re-resolve the fee on every row that already has a delivery district when the customer
  // (and therefore their pricing) changes.
  useEffect(() => {
    if (!open) return;
    setPkgs(rows => rows.map(r => {
      if (!r.recipientDistrictObj) return r;
      const resolved = resolveServicePrice(r.recipientDistrictObj, custPricing);
      return { ...r, svcPrice: resolved != null ? String(resolved) : '' };
    }));
  }, [custPricing, open]);

  // Debounced customer lookup while typing an ID number or phone (only when no
  // existing customer is locked in).
  useEffect(() => {
    if (!open || !token || selected || !suggestFor) { setResults([]); return; }
    const term = (suggestFor === 'idNumber' ? cust.idNumber : cust.phoneNumber).trim();
    if (term.length < 2) { setResults([]); return; }
    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const page = await getCustomers(token, 1, 8, term);
        setResults(page.items);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [open, token, selected, suggestFor, cust.idNumber, cust.phoneNumber]);

  useEffect(() => () => window.clearTimeout(blurTimer.current), []);

  if (!open) return null;

  const setCF = (field: keyof CustForm) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCust(f => ({ ...f, [field]: e.target.value }));
    setCustErrors(prev => ({ ...prev, [field]: undefined }));
    setApiError(null);
  };

  const pickCustomer = (c: AdminCustomer) => {
    setSelected(c);
    setCust({
      firstName: c.firstName, lastName: c.lastName, idNumber: c.idNumber ?? '',
      businessName: c.businessName, phoneNumber: c.phoneNumber,
      city: c.city, district: c.district, address: c.address,
    });
    setResults([]); setSuggestFor(null); setCustErrors({});
  };

  const unlockCustomer = () => {
    setSelected(null);
    setResults([]); setSuggestFor(null);
  };

  const setPkg = (i: number, patch: Partial<PkgRow>) => {
    setPkgs(rows => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setPkgErrors(errs => errs.map((e, idx) => {
      if (idx !== i) return e;
      const next = { ...e };
      for (const k of Object.keys(patch)) delete next[k as keyof PkgRow];
      return next;
    }));
    setApiError(null);
  };

  const addPkg    = () => { setPkgs(r => [...r, emptyPkg()]); setPkgErrors(e => [...e, {}]); };
  const removePkg = (i: number) => {
    setPkgs(r => r.filter((_, idx) => idx !== i));
    setPkgErrors(e => e.filter((_, idx) => idx !== i));
  };

  const validate = (): boolean => {
    let ok = true;

    // Customer
    if (!selected) {
      const ce: Partial<Record<keyof CustForm, string>> = {};
      if (!cust.firstName.trim())    ce.firstName    = t.errFirstNameRequired;
      if (!cust.lastName.trim())     ce.lastName     = t.errLastNameRequired;
      if (!cust.idNumber.trim())     ce.idNumber     = t.apErrIdNumberRequired;
      if (!cust.businessName.trim()) ce.businessName = t.errBusinessNameRequired;
      if (!cust.phoneNumber.trim())  ce.phoneNumber  = t.errPhoneRequired;
      else if (!isValidGeorgianMobile(cust.phoneNumber)) ce.phoneNumber = t.cgoErrInvalidPhone;
      if (!cust.city.trim())         ce.city         = t.errCityRequired;
      if (!cust.district.trim())     ce.district     = t.errDistrictRequired;
      if (!cust.address.trim())      ce.address      = t.errAddressRequired;
      setCustErrors(ce);
      if (Object.keys(ce).length) ok = false;
    }

    // Packages
    if (pkgs.length === 0) { setApiError(t.apErrNeedPackage); return false; }
    const pe: PkgErrors[] = pkgs.map(p => {
      const e: PkgErrors = {};
      if (!p.recipientPhone.trim())        e.recipientPhone = t.errPhoneRequired;
      else if (!isValidGeorgianMobile(p.recipientPhone)) e.recipientPhone = t.cgoErrInvalidPhone;
      if (!p.recipientCity.trim())         e.recipientCity     = t.errCityRequired;
      if (!p.recipientDistrict.trim())     e.recipientDistrict = t.errDistrictRequired;
      if (!p.recipientAddress.trim())      e.recipientAddress  = t.errAddressRequired;
      if (!p.svcPrice.trim())              e.svcPrice = t.eomErrServicePriceRequired;
      else if (isNaN(parseFloat(p.svcPrice)) || parseFloat(p.svcPrice) < 0) e.svcPrice = t.eomErrInvalidAmount;
      if (p.payStatus === 'NotPaid' && p.codAmount.trim() &&
          (isNaN(parseFloat(p.codAmount)) || parseFloat(p.codAmount) < 0)) e.codAmount = t.eomErrInvalidAmount;
      if (p.orderType === 'Return') {
        if (!p.returnCity.trim())     e.returnCity     = t.errCityRequired;
        if (!p.returnDistrict.trim()) e.returnDistrict = t.errDistrictRequired;
        if (!p.returnAddress.trim())  e.returnAddress  = t.errAddressRequired;
      }
      return e;
    });
    setPkgErrors(pe);
    if (pe.some(e => Object.keys(e).length)) ok = false;

    if (!ok) setApiError(t.eomFixErrors);
    return ok;
  };

  const handleSubmit = async () => {
    if (!token || !validate()) return;
    setLoading(true);
    setApiError(null);

    const orders: WalkInPackageInput[] = pkgs.map(p => {
      const svc = parseFloat(p.svcPrice) || 0;
      const codRaw = p.payStatus === 'NotPaid' && p.codAmount.trim() ? parseFloat(p.codAmount) : null;
      // COD is entered product-only; re-bundle the fee when the price is all-in so the
      // backend (which subtracts the fee for included orders) stores it correctly.
      const cod = codRaw == null ? null : (p.svcIncluded ? codRaw + svc : codRaw);
      const isReturn = p.orderType === 'Return';
      return {
        orderType: p.orderType,
        recipientName: p.recipientName.trim(),
        recipientPhone: p.recipientPhone.trim(),
        recipientCity: p.recipientCity.trim(),
        recipientDistrict: p.recipientDistrict.trim(),
        recipientAddress: p.recipientAddress.trim(),
        description: p.description.trim() || null,
        isFragile: p.isFragile,
        productPaymentStatus: p.payStatus,
        whoPaysForCompanyService: p.payer,
        amountToCollectForPackage: cod,
        companyServicePrice: svc,
        isCompanyServicePriceIncluded: p.svcIncluded,
        returnPickupCity: isReturn ? p.returnCity.trim() || null : null,
        returnPickupDistrict: isReturn ? p.returnDistrict.trim() || null : null,
        returnPickupAddress: isReturn ? p.returnAddress.trim() || null : null,
      };
    });

    try {
      const result = await createWalkInOrder(token, {
        existingCustomerId: selected ? selected.id : null,
        newCustomer: selected ? null : {
          firstName: cust.firstName.trim(), lastName: cust.lastName.trim(),
          idNumber: cust.idNumber.trim(), businessName: cust.businessName.trim(),
          phoneNumber: cust.phoneNumber.trim(),
          city: cust.city.trim(), district: cust.district.trim(), address: cust.address.trim(),
        },
        orders,
      });
      onCreated(result);
    } catch (err) {
      if (err instanceof WalkInOrderError && err.errors) {
        const keys = Object.keys(err.errors);
        if (keys.includes('DuplicateBusinessName')) {
          setCustErrors(prev => ({ ...prev, businessName: t.errBusinessNameTaken }));
          setApiError(t.errBusinessNameTaken);
        } else {
          setApiError(err.errors[keys[0]]?.[0] ?? err.message);
        }
      } else {
        setApiError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      }
    } finally {
      setLoading(false);
    }
  };

  const custLocked = selected !== null;

  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div className="ui-modal ap-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="ui-modal__header">
          <span className="ui-modal__title">{t.apModalTitle}</span>
          <button className="ui-modal__close" onClick={onClose} aria-label={t.close}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="ui-modal__body">
          {/* ── Customer ─────────────────────────────────────────────── */}
          <div className="ap-section-head">
            <p className="ui-modal__section-label" style={{ margin: 0 }}>{t.apCustomerSection}</p>
            {custLocked && (
              <button type="button" className="ap-link-btn" onClick={unlockCustomer}>{t.apChangeCustomer}</button>
            )}
          </div>

          {custLocked ? (
            <div className="ap-selected">
              <div className="ap-selected__name">
                {selected!.businessName}
                <span className={`ap-badge ${selected!.hasAccount ? 'ap-badge--acc' : 'ap-badge--noacc'}`}>
                  {selected!.hasAccount ? t.apHasAccountBadge : t.apNoAccountBadge}
                </span>
              </div>
              <div className="ap-selected__meta">
                {selected!.firstName} {selected!.lastName} · {selected!.phoneNumber}
                {selected!.idNumber ? ` · ${selected!.idNumber}` : ''}
              </div>
              <div className="ap-selected__meta">{selected!.city}, {selected!.district}, {selected!.address}</div>
            </div>
          ) : (
            <>
              <p className="ap-hint">{t.apSearchHint}</p>
              <div className="ui-modal__row">
                <FormField label={t.firstName} value={cust.firstName} onChange={setCF('firstName')} error={custErrors.firstName} />
                <FormField label={t.lastName}  value={cust.lastName}  onChange={setCF('lastName')}  error={custErrors.lastName} />
              </div>
              <FormField label={t.businessName} value={cust.businessName} onChange={setCF('businessName')} error={custErrors.businessName} />
              <div className="ui-modal__row">
                <div className="ap-suggest-wrap">
                  <FormField
                    label={t.idNumber}
                    value={cust.idNumber}
                    onChange={setCF('idNumber')}
                    error={custErrors.idNumber}
                    onFocus={() => setSuggestFor('idNumber')}
                    onBlur={() => { blurTimer.current = window.setTimeout(() => setSuggestFor(null), 150); }}
                    autoComplete="off"
                  />
                  {suggestFor === 'idNumber' && (
                    <CustomerSuggestList
                      results={results} searching={searching} noResults={t.apNoResults}
                      accLabel={t.apHasAccountBadge} noAccLabel={t.apNoAccountBadge}
                      onPick={pickCustomer}
                    />
                  )}
                </div>
                <div className="ap-suggest-wrap">
                  <GeorgianPhoneField
                    label={t.phoneNumber}
                    value={cust.phoneNumber}
                    onValueChange={v => {
                      setCust(f => ({ ...f, phoneNumber: v }));
                      setCustErrors(p => ({ ...p, phoneNumber: undefined }));
                      setApiError(null);
                    }}
                    error={custErrors.phoneNumber}
                    invalidMessage={t.cgoErrInvalidPhone}
                    onFocus={() => setSuggestFor('phoneNumber')}
                    onBlur={() => { blurTimer.current = window.setTimeout(() => setSuggestFor(null), 150); }}
                  />
                  {suggestFor === 'phoneNumber' && (
                    <CustomerSuggestList
                      results={results} searching={searching} noResults={t.apNoResults}
                      accLabel={t.apHasAccountBadge} noAccLabel={t.apNoAccountBadge}
                      onPick={pickCustomer}
                    />
                  )}
                </div>
              </div>
              <CityDistrictPicker
                cityValue={cust.city} districtValue={cust.district}
                onCityChange={v => { setCust(f => ({ ...f, city: v, district: '' })); setCustErrors(p => ({ ...p, city: undefined, district: undefined })); }}
                onDistrictChange={v => { setCust(f => ({ ...f, district: v })); setCustErrors(p => ({ ...p, district: undefined })); }}
                cityError={custErrors.city} districtError={custErrors.district}
              />
              <FormField label={t.streetAddress} value={cust.address} onChange={setCF('address')} error={custErrors.address} />
            </>
          )}

          <div className="ui-modal__divider" />

          {/* ── Packages ─────────────────────────────────────────────── */}
          <p className="ui-modal__section-label">{t.apPackagesSection}</p>
          {pkgs.map((p, i) => (
            <PackageCard
              key={i}
              index={i}
              row={p}
              errors={pkgErrors[i] ?? {}}
              canRemove={pkgs.length > 1}
              customerPricing={custPricing}
              onChange={patch => setPkg(i, patch)}
              onRemove={() => removePkg(i)}
            />
          ))}
          <button type="button" className="ap-add-btn" onClick={addPkg}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t.apAddAnother}
          </button>

          {apiError && <div className="ui-modal__error" role="alert">{apiError}</div>}
        </div>

        <div className="ui-modal__footer">
          <button className="ui-modal__btn ui-modal__btn--ghost" onClick={onClose} disabled={loading}>{t.cancel}</button>
          <button className="ui-modal__btn ui-modal__btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t.apSubmitting : t.apSubmit}
          </button>
        </div>
      </div>

      <style>{`
        .ap-modal { width: min(720px, calc(100vw - 32px)); }
        .ap-section-head { display: flex; align-items: center; justify-content: space-between; }
        .ap-link-btn { background: none; border: none; color: var(--color-accent); font-size: 0.8rem; font-weight: 600; cursor: pointer; padding: 0; }
        .ap-hint { font-size: 0.78rem; color: var(--color-text-muted); margin: 4px 0 10px; line-height: 1.45; }
        .ap-suggest-wrap { position: relative; }
        .ap-suggest { position: absolute; top: calc(100% + 2px); left: 0; right: 0; z-index: 30; background: var(--color-bg-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); box-shadow: 0 8px 24px rgba(0,0,0,0.16); max-height: 240px; overflow-y: auto; }
        .ap-suggest__item { display: block; width: 100%; text-align: left; background: none; border: none; border-bottom: 1px solid var(--color-border); padding: 8px 10px; cursor: pointer; color: var(--color-text); }
        .ap-suggest__item:last-child { border-bottom: none; }
        .ap-suggest__item:hover { background: var(--color-bg-3); }
        .ap-suggest__name { font-size: 0.82rem; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .ap-suggest__meta { font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px; }
        .ap-suggest__empty { padding: 10px; font-size: 0.78rem; color: var(--color-text-muted); }
        .ap-badge { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px; border-radius: 100px; }
        .ap-badge--acc { background: rgba(16,185,129,0.12); color: #10b981; border: 1px solid rgba(16,185,129,0.35); }
        .ap-badge--noacc { background: var(--color-bg-3); color: var(--color-text-subtle); border: 1px solid var(--color-border); }
        .ap-selected { background: var(--color-bg-3); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 10px 12px; }
        .ap-selected__name { font-size: 0.9rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .ap-selected__meta { font-size: 0.76rem; color: var(--color-text-muted); margin-top: 3px; }
        .ap-add-btn { display: inline-flex; align-items: center; gap: 6px; background: var(--color-bg-3); border: 1px dashed var(--color-border); border-radius: var(--radius-sm); color: var(--color-text-subtle); font-size: 0.8rem; font-weight: 600; padding: 8px 14px; cursor: pointer; margin-top: 4px; }
        .ap-add-btn:hover { color: var(--color-text); border-color: var(--color-text-subtle); }
        .ap-pkg { border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; }
        .ap-pkg__head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .ap-pkg__title { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--color-text-subtle); }
        .ap-pkg__remove { background: none; border: none; color: #ef4444; font-size: 0.75rem; font-weight: 600; cursor: pointer; padding: 0; }
        .ap-type-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .ap-type-btn { padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-bg-3); color: var(--color-text-subtle); font-size: 0.78rem; font-weight: 600; cursor: pointer; }
        .ap-type-btn--active { background: var(--color-accent-dim); border-color: rgba(196,127,23,0.4); color: var(--color-accent); }
        .ap-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ap-grid > .ap-col-2 { grid-column: span 2; }
        .ap-mini-label { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-subtle); display: block; margin-bottom: 4px; }
        .ap-input { width: 100%; box-sizing: border-box; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); color: var(--color-text); font-size: 16px; padding: 8px 10px; font-family: var(--font-body); }
        .ap-input:focus { outline: none; border-color: var(--color-accent); }
        .ap-input--err { border-color: #ef4444; }
        .ap-err { font-size: 0.7rem; color: #ef4444; margin-top: 3px; }
        .ap-check { display: flex; align-items: center; gap: 7px; font-size: 0.8rem; cursor: pointer; }
        .ap-return-box { border: 1px solid rgba(239,68,68,0.3); background: rgba(239,68,68,0.03); border-radius: var(--radius-sm); padding: 10px; margin-top: 10px; }
        .ap-return-box__legend { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ef4444; margin-bottom: 8px; }
        @media (max-width: 560px) { .ap-grid { grid-template-columns: 1fr; } .ap-grid > .ap-col-2 { grid-column: span 1; } }
      `}</style>
    </div>
  );
}

// ── Customer suggestions dropdown ─────────────────────────────────────────────

function CustomerSuggestList({
  results, searching, noResults, accLabel, noAccLabel, onPick,
}: {
  results: AdminCustomer[]; searching: boolean; noResults: string;
  accLabel: string; noAccLabel: string; onPick: (c: AdminCustomer) => void;
}) {
  if (!searching && results.length === 0) return null;
  return (
    <div className="ap-suggest">
      {results.length === 0 && searching && <div className="ap-suggest__empty">…</div>}
      {results.length === 0 && !searching && <div className="ap-suggest__empty">{noResults}</div>}
      {results.map(c => (
        <button
          key={c.id}
          type="button"
          className="ap-suggest__item"
          // mousedown fires before the field's blur, so the pick isn't lost
          onMouseDown={e => { e.preventDefault(); onPick(c); }}
        >
          <span className="ap-suggest__name">
            {c.businessName}
            <span className={`ap-badge ${c.hasAccount ? 'ap-badge--acc' : 'ap-badge--noacc'}`}>
              {c.hasAccount ? accLabel : noAccLabel}
            </span>
          </span>
          <span className="ap-suggest__meta">
            {c.firstName} {c.lastName} · {c.phoneNumber}{c.idNumber ? ` · ${c.idNumber}` : ''}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── One package row ──────────────────────────────────────────────────────────

function PackageCard({
  index, row, errors, canRemove, customerPricing, onChange, onRemove,
}: {
  index: number;
  row: PkgRow;
  errors: PkgErrors;
  canRemove: boolean;
  customerPricing: CustomerServicePricing | null;
  onChange: (patch: Partial<PkgRow>) => void;
  onRemove: () => void;
}) {
  const { t } = useLanguage();
  const isReturn = row.orderType === 'Return';

  const TYPES: { v: OrderType; label: string }[] = [
    { v: 'Send',     label: t.cgoOrderTypeSend },
    { v: 'Return',   label: t.cgoOrderTypeReturn },
    { v: 'Exchange', label: t.cgoOrderTypeExchange },
  ];

  return (
    <div className="ap-pkg">
      <div className="ap-pkg__head">
        <span className="ap-pkg__title">{t.apPackageLabel} {index + 1}</span>
        {canRemove && (
          <button type="button" className="ap-pkg__remove" onClick={onRemove}>{t.apRemovePackage}</button>
        )}
      </div>

      <div className="ap-type-row">
        {TYPES.map(tp => (
          <button
            key={tp.v}
            type="button"
            className={`ap-type-btn${row.orderType === tp.v ? ' ap-type-btn--active' : ''}`}
            onClick={() => onChange({ orderType: tp.v })}
          >
            {tp.label}
          </button>
        ))}
      </div>

      <div className="ap-grid">
        <div className="ap-col-2">
          <label className="ap-mini-label">{t.cgoRecipientName}</label>
          <input className="ap-input" value={row.recipientName}
            onChange={e => onChange({ recipientName: e.target.value })} />
        </div>
        <div className="ap-col-2">
          <GeorgianPhoneField
            label={t.eomPhone}
            required
            value={row.recipientPhone}
            onValueChange={v => onChange({ recipientPhone: v })}
            error={errors.recipientPhone}
            invalidMessage={t.cgoErrInvalidPhone}
          />
        </div>

        <div className="ap-col-2">
          <label className="ap-mini-label">{t.eomDeliveryCity}</label>
          <CityDistrictPicker
            cityValue={row.recipientCity}
            districtValue={row.recipientDistrict}
            onCityChange={v => onChange({ recipientCity: v, recipientDistrict: '', recipientDistrictObj: null })}
            onDistrictChange={v => onChange({ recipientDistrict: v })}
            onDistrictSelect={d => {
              // Auto-fill the fee from the pricing waterfall (customer special price →
              // customer tier → district default). Stays editable. New customers have no
              // pricing → the district's own default is used.
              if (!d) { onChange({ recipientDistrictObj: null }); return; }
              const resolved = resolveServicePrice(d, customerPricing);
              onChange({
                recipientDistrictObj: d,
                svcPrice: resolved != null ? String(resolved) : '',
              });
            }}
            cityError={errors.recipientCity}
            districtError={errors.recipientDistrict}
          />
        </div>
        <div className="ap-col-2">
          <label className="ap-mini-label">{t.streetAddress}</label>
          <input className={`ap-input${errors.recipientAddress ? ' ap-input--err' : ''}`} value={row.recipientAddress}
            onChange={e => onChange({ recipientAddress: e.target.value })} />
          {errors.recipientAddress && <div className="ap-err">{errors.recipientAddress}</div>}
        </div>

        <div className="ap-col-2">
          <label className="ap-mini-label">{t.eomDescription}</label>
          <input className="ap-input" value={row.description}
            onChange={e => onChange({ description: e.target.value })} />
        </div>

        <div>
          <label className="ap-mini-label">{t.eomPayStatus}</label>
          <select className="ap-input" value={row.payStatus}
            onChange={e => onChange({ payStatus: e.target.value as PkgRow['payStatus'] })}>
            <option value="NotPaid">{t.eomUnpaid}</option>
            <option value="Paid">{t.eomPaid}</option>
          </select>
        </div>
        <div>
          <label className="ap-mini-label">{t.eomServicePayer}</label>
          <select className="ap-input" value={row.payer}
            onChange={e => onChange({ payer: e.target.value as PkgRow['payer'] })}>
            <option value="Sender">{t.eomPayerSender}</option>
            <option value="Recipient">{t.eomPayerRecipient}</option>
          </select>
        </div>

        {row.payStatus === 'NotPaid' && (
          <div>
            <label className="ap-mini-label">{t.eomCodAmount}</label>
            <input className={`ap-input${errors.codAmount ? ' ap-input--err' : ''}`} type="number" min="0" step="0.01"
              value={row.codAmount} onChange={e => onChange({ codAmount: e.target.value })} placeholder="0.00" />
            {errors.codAmount && <div className="ap-err">{errors.codAmount}</div>}
          </div>
        )}
        <div>
          <label className="ap-mini-label">{t.eomSvcPrice} *</label>
          <input className={`ap-input${errors.svcPrice ? ' ap-input--err' : ''}`} type="number" min="0" step="0.01"
            value={row.svcPrice} onChange={e => onChange({ svcPrice: e.target.value })} placeholder="0.00" />
          {errors.svcPrice && <div className="ap-err">{errors.svcPrice}</div>}
        </div>

        <div className="ap-col-2">
          <label className="ap-check">
            <input type="checkbox" checked={row.svcIncluded}
              onChange={e => onChange({ svcIncluded: e.target.checked })} />
            <span>{t.cgoServiceIncluded}</span>
          </label>
        </div>
        <div className="ap-col-2">
          <label className="ap-check">
            <input type="checkbox" checked={row.isFragile}
              onChange={e => onChange({ isFragile: e.target.checked })} />
            <span>{t.eomFragileContains}</span>
          </label>
        </div>
      </div>

      {isReturn && (
        <div className="ap-return-box">
          <div className="ap-return-box__legend">{t.eomLegendReturnPickup}</div>
          <div className="ap-grid">
            <div className="ap-col-2">
              <label className="ap-mini-label">{t.eomReturnCityDistrict}</label>
              <CityDistrictPicker
                cityValue={row.returnCity}
                districtValue={row.returnDistrict}
                onCityChange={v => onChange({ returnCity: v, returnDistrict: '' })}
                onDistrictChange={v => onChange({ returnDistrict: v })}
                cityError={errors.returnCity}
                districtError={errors.returnDistrict}
              />
            </div>
            <div className="ap-col-2">
              <label className="ap-mini-label">{t.streetAddress}</label>
              <input className={`ap-input${errors.returnAddress ? ' ap-input--err' : ''}`} value={row.returnAddress}
                onChange={e => onChange({ returnAddress: e.target.value })} placeholder={t.eomReturnAddressPh} />
              {errors.returnAddress && <div className="ap-err">{errors.returnAddress}</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
