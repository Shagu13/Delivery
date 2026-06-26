import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { updateOrder, adminMarkOrderDelivered, adminMarkReturnAtWarehouse, assignCourierToOrder, setCourierSalary, correctOrderStatus } from '../../api/orders';
import type { AdminOrderItem } from './AdminOrdersPage';
import type { Courier } from '../../api/couriers';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import type { District } from '../../api/cities';
import { GeorgianPhoneField, sanitizeGeorgianMobile, isValidGeorgianMobile } from '../../components/ui/GeorgianPhoneField';
import { useLanguage } from '../../contexts/useLanguage';

/** Customer-specific service pricing tiers, used to auto-fill the service price by district. */
export interface CustomerServicePricing {
    capital: number | null;
    city: number | null;
    district: number | null;
}

// Resolve the company service price for a selected district. Customer-specific tier
// wins by territory (capital → city → generic district), falling back to the district's
// own configured price. Returns null when nothing is configured (leaves the field empty).
function resolveServicePrice(d: District, cp?: CustomerServicePricing | null): number | null {
    if (cp) {
        if (d.isCapitalTerritory && (cp.capital ?? 0) > 0) return cp.capital!;
        if (d.isCityTerritory    && (cp.city    ?? 0) > 0) return cp.city!;
        if ((cp.district ?? 0) > 0) return cp.district!;
    }
    if ((d.companyServicePrice ?? 0) > 0) return d.companyServicePrice!;
    return null;
}

interface Props {
    order: AdminOrderItem | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    token: string;
    canMarkDelivered?: boolean;
    canMarkWarehouse?: boolean;
    couriers?: Courier[];
    onActioned?: () => void;
    /** When provided, selecting a delivery district auto-fills the service price by territory. */
    customerPricing?: CustomerServicePricing | null;
}

export function EditOrderModal({ order, open, onClose, onSaved, token, canMarkDelivered, canMarkWarehouse, couriers = [], onActioned, customerPricing }: Props) {
    // ── Form state ────────────────────────────────────────────────────────────
    const [name,        setName]        = useState('');
    const [phone,       setPhone]       = useState('');
    const [city,        setCity]        = useState('');
    const [district,    setDistrict]    = useState('');
    const [address,     setAddress]     = useState('');
    const [description, setDescription] = useState('');
    const [isFragile,   setIsFragile]   = useState(false);
    const [payer,       setPayer]       = useState('Sender');
    const [payStatus,   setPayStatus]   = useState('NotPaid');
    const [codAmount,   setCodAmount]   = useState('');
    const [svcPrice,    setSvcPrice]    = useState('');
    const [svcIncluded, setSvcIncluded] = useState(false);
    const [salary,      setSalary]      = useState('');

    // Return/Exchange fields
    const [orderType,           setOrderType]           = useState('Send');
    const [returnCity,          setReturnCity]          = useState('');
    const [returnDistrict,      setReturnDistrict]      = useState('');
    const [returnAddress,       setReturnAddress]       = useState('');
    const [statusOverride,      setStatusOverride]      = useState('');

    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState<string | null>(null);
    const [errors,     setErrors]     = useState<Record<string, string>>({});
    const [activeTab,  setActiveTab]  = useState<'delivery' | 'financials' | 'type'>('delivery');

    const { t } = useLanguage();

    const ORDER_TYPE_OPTIONS = [
        { value: 'Send',     label: t.cgoOrderTypeSend,     color: 'var(--color-text-subtle)' },
        { value: 'Return',   label: t.cgoOrderTypeReturn,   color: '#ef4444' },
        { value: 'Exchange', label: t.cgoOrderTypeExchange, color: '#3b82f6' },
    ];

    const STATUS_OVERRIDE_OPTIONS = [
        { value: '',                  label: t.eomStatusNoChange },
        { value: 'ReturnedToSender',  label: t.eomStatusReturnedToSender },
        { value: 'ExchangeCompleted', label: t.eomStatusExchangeCompleted },
        { value: 'CancelledByAdmin',  label: t.eomStatusCancelledAdmin },
    ];

    // ── Status action state ───────────────────────────────────────────────────
    const [actionConfirm,   setActionConfirm]   = useState<'delivered' | 'warehouse' | null>(null);
    const [actionCourierId, setActionCourierId] = useState('');
    const [actionSalary,    setActionSalary]    = useState('');
    const [actionBusy,      setActionBusy]      = useState(false);
    const [actionError,     setActionError]     = useState<string | null>(null);

    // ── Mistaken-status correction (un-cancel / un-deliver) ───────────────────
    const [correctConfirm, setCorrectConfirm] = useState<'UnCancel' | 'UnDeliver' | null>(null);
    const [correctBusy,    setCorrectBusy]    = useState(false);
    const [correctError,   setCorrectError]   = useState<string | null>(null);

    // Populate form when order changes
    useEffect(() => {
        if (!order) return;
        setName(order.recipientName);
        setPhone(sanitizeGeorgianMobile(order.recipientPhone));
        setCity(order.recipientCity);
        setDistrict(order.recipientDistrict);
        setAddress(order.recipientAddress);
        setDescription(order.description ?? '');
        setIsFragile(order.isFragile);
        setPayer(order.whoPaysForCompanyService);
        setPayStatus(order.productPaymentStatus);
        // The COD field always shows the product-only amount; the company service fee is
        // edited separately on the Financials tab (re-bundled on save when included).
        setCodAmount(
            order.amountToCollectForPackage != null
                ? String(order.amountToCollectForPackage)
                : ''
        );
        setSvcPrice(String(order.companyServicePrice));
        setSvcIncluded(order.isCompanyServicePriceIncluded);
        setSalary(order.courierSalary != null ? String(order.courierSalary) : '');
        setOrderType(order.orderType ?? 'Send');
        setReturnCity(order.returnPickupCity ?? '');
        setReturnDistrict(order.returnPickupDistrict ?? '');
        setReturnAddress(order.returnPickupAddress ?? '');
        setStatusOverride('');
        setCorrectConfirm(null);
        setCorrectError(null);
        setError(null);
        setErrors({});
        setActiveTab('delivery');
    }, [order]);

    // Escape to close
    useEffect(() => {
        if (!open) return;
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [open, onClose]);

    if (!open || !order) return null;

    const isReturn      = orderType === 'Return';
    const needsSalary   = order.courierSalary == null || order.courierSalary === 0;
    const salaryVal     = parseFloat(actionSalary);
    const salaryValid   = !isNaN(salaryVal) && salaryVal >= 0;
    const canConfirm    = !needsSalary || salaryValid;

    const handleAction = async () => {
        if (!order || !actionConfirm) return;
        setActionBusy(true);
        setActionError(null);
        try {
            if (actionCourierId) await assignCourierToOrder(token, order.id, actionCourierId);
            const salaryVal = parseFloat(actionSalary);
            if (actionSalary && !isNaN(salaryVal)) await setCourierSalary(token, order.id, salaryVal);
            if (actionConfirm === 'delivered') await adminMarkOrderDelivered(token, order.id);
            else await adminMarkReturnAtWarehouse(token, order.id);
            setActionConfirm(null);
            setActionCourierId('');
            setActionSalary('');
            onActioned?.();
            onClose();
        } catch (e) {
            setActionError(e instanceof Error ? e.message : 'Action failed.');
        } finally {
            setActionBusy(false);
        }
    };

    // ── Correct a courier's mistaken terminal status ──────────────────────────
    // Un-cancel: a cancelled order (e.g. cancelled instead of postponed). Un-deliver: an
    // order marked delivered by mistake. Send/Exchange only — Returns run a separate flow.
    const isReturnOrder = order.orderType === 'Return';
    const canUnCancel   = !isReturnOrder &&
        ['OrderNotAccepted', 'CancelledByAdmin', 'CancelledBySender'].includes(order.status);
    const canUnDeliver  = !isReturnOrder &&
        ['DeliveredToRecipient', 'ExchangeCompleted'].includes(order.status);

    const handleCorrect = async (correction: 'UnCancel' | 'UnDeliver') => {
        if (!order) return;
        setCorrectBusy(true);
        setCorrectError(null);
        try {
            await correctOrderStatus(token, order.id, correction);
            setCorrectConfirm(null);
            onActioned?.();
            onClose();
        } catch (e) {
            setCorrectError(e instanceof Error ? e.message : 'Correction failed.');
        } finally {
            setCorrectBusy(false);
        }
    };

    // Drop a single field's error as soon as the admin edits it.
    const clearErr = (field: string) => setErrors(prev => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
    });

    const validate = (): boolean => {
        const e: Record<string, string> = {};

        // Recipient (delivery tab) — name is optional (blank shows "Unknown"/"უცნობი").
        if (!phone.trim())     e.phone     = t.errPhoneRequired;
        else if (!isValidGeorgianMobile(phone)) e.phone = t.cgoErrInvalidPhone;
        if (!city.trim())      e.city      = t.errCityRequired;
        if (!district.trim())  e.district  = t.errDistrictRequired;
        if (!address.trim())   e.address   = t.errAddressRequired;

        // COD amount — only relevant for unpaid parcels; optional but must be valid.
        // This is the product-only price; the service fee is validated on its own field.
        if (payStatus === 'NotPaid' && codAmount.trim()) {
            const n = parseFloat(codAmount);
            if (isNaN(n) || n < 0) e.codAmount = t.eomErrInvalidAmount;
        }

        // Company service price (financials tab) — required, non-negative.
        if (!svcPrice.trim()) {
            e.svcPrice = t.eomErrServicePriceRequired;
        } else {
            const n = parseFloat(svcPrice);
            if (isNaN(n) || n < 0) e.svcPrice = t.eomErrInvalidAmount;
        }

        // Courier salary — optional, but must be valid when provided.
        if (salary.trim()) {
            const n = parseFloat(salary);
            if (isNaN(n) || n < 0) e.salary = t.eomErrInvalidAmount;
        }

        // Return pickup address (type tab) — required for Return orders.
        if (isReturn) {
            if (!returnCity.trim())     e.returnCity     = t.errCityRequired;
            if (!returnDistrict.trim()) e.returnDistrict = t.errDistrictRequired;
            if (!returnAddress.trim())  e.returnAddress  = t.errAddressRequired;
        }

        setErrors(e);

        // Surface the first offending tab so the highlighted fields are visible.
        if (Object.keys(e).length > 0) {
            if (e.name || e.phone || e.city || e.district || e.address || e.codAmount || e.svcPrice) {
                setActiveTab('delivery');
            } else if (e.returnCity || e.returnDistrict || e.returnAddress) {
                setActiveTab('type');
            } else if (e.salary) {
                setActiveTab('financials');
            }
            setError(t.eomFixErrors);
        }

        return Object.keys(e).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;
        setSaving(true);
        setError(null);
        try {
            await updateOrder(token, order.id, {
                recipientName:             name.trim(),
                recipientPhone:            phone.trim(),
                recipientCity:             city.trim(),
                recipientDistrict:         district.trim(),
                recipientAddress:          address.trim(),
                description:               description.trim() || null,
                isFragile,
                whoPaysForCompanyService:  payer,
                productPaymentStatus:      payStatus,
                // COD is entered product-only; re-bundle the fee when the price is all-in so
                // the backend (which subtracts the fee for included orders) stores it correctly.
                amountToCollectForPackage: codAmount
                    ? (svcIncluded ? parseFloat(codAmount) + (parseFloat(svcPrice) || 0) : parseFloat(codAmount))
                    : null,
                companyServicePrice:       parseFloat(svcPrice) || 0,
                isCompanyServicePriceIncluded: svcIncluded,
                courierSalary:             salary ? parseFloat(salary) : null,
                orderType,
                returnPickupCity:          isReturn ? returnCity.trim() || null     : null,
                returnPickupDistrict:      isReturn ? returnDistrict.trim() || null : null,
                returnPickupAddress:       isReturn ? returnAddress.trim() || null  : null,
                statusOverride:            statusOverride || null,
            });
            onSaved();
            onClose();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Save failed.');
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <>
            <div className="modal-backdrop" onClick={onClose} />
            <div className="modal edit-order-modal" role="dialog" aria-modal="true" aria-labelledby="edit-order-title">

                {/* Header */}
                <div className="modal__header">
                    <div>
                        <p className="modal__eyebrow">{t.eomEyebrow}</p>
                        <h2 className="modal__title" id="edit-order-title">
                            <span className="tn-badge" style={{ fontSize: '0.85rem', marginRight: 8 }}>{order.trackingNumber}</span>
                            {(order.orderType && order.orderType !== 'Send') && (
                                <span style={{
                                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
                                    padding: '2px 8px', borderRadius: 99,
                                    background: order.orderType === 'Return' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                                    color: order.orderType === 'Return' ? '#ef4444' : '#3b82f6',
                                    border: `1px solid ${order.orderType === 'Return' ? '#ef4444' : '#3b82f6'}`,
                                    textTransform: 'uppercase',
                                }}>
                                    {order.orderType}
                                </span>
                            )}
                        </h2>
                    </div>
                    <button className="modal__close" onClick={onClose} aria-label="Close">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div className="eom-tabs">
                    <button className={`eom-tab${activeTab === 'delivery' ? ' eom-tab--active' : ''}`} onClick={() => setActiveTab('delivery')}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        {t.eomTabDelivery}
                    </button>
                    <button className={`eom-tab${activeTab === 'type' ? ' eom-tab--active' : ''}`} onClick={() => setActiveTab('type')}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                            <path d="M2 8h12M8 2l4 6-4 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {t.eomTabType}
                    </button>
                    <button className={`eom-tab${activeTab === 'financials' ? ' eom-tab--active' : ''}`} onClick={() => setActiveTab('financials')}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M8 5v6M6 7h3.5a1.5 1.5 0 010 3H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                        </svg>
                        {t.eomTabFinancials}
                    </button>
                </div>

                {/* Body */}
                <div className="modal__body">
                    {error && (
                        <div className="modal__global-error">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
                                <path d="M8 5v3.5M8 11h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* ── Delivery tab ───────────────────────────────────────── */}
                    {activeTab === 'delivery' && (
                        <fieldset className="modal__fieldset">
                            <legend className="modal__legend">{t.eomLegendRecipient}</legend>
                            <div className="eom-grid">
                                <div className="eom-col-2">
                                    <Field label={t.cgoRecipientName} error={errors.name}>
                                        <input className="eom-input" value={name} onChange={e => { setName(e.target.value); clearErr('name'); }} />
                                    </Field>
                                </div>
                                <div className="eom-col-2">
                                    <GeorgianPhoneField
                                        label={t.eomPhone}
                                        required
                                        value={phone}
                                        onValueChange={v => { setPhone(v); clearErr('phone'); }}
                                        error={errors.phone}
                                        invalidMessage={t.cgoErrInvalidPhone}
                                    />
                                </div>

                                <Field label={t.eomDeliveryCity} required className="eom-col-2">
                                    <CityDistrictPicker
                                        cityValue={city}
                                        districtValue={district}
                                        onCityChange={v => { setCity(v); setDistrict(''); clearErr('city'); clearErr('district'); }}
                                        onDistrictChange={v => { setDistrict(v); clearErr('district'); }}
                                        onDistrictSelect={d => {
                                            // Overwrite the service price with the chosen district's price
                                            // (customer tier first, then district default); stays editable.
                                            if (!d) return;
                                            const resolved = resolveServicePrice(d, customerPricing);
                                            setSvcPrice(resolved != null ? String(resolved) : '');
                                            clearErr('svcPrice');
                                        }}
                                        cityError={errors.city}
                                        districtError={errors.district}
                                    />
                                </Field>
                                <Field label={t.streetAddress} required className="eom-col-2" error={errors.address}>
                                    <input className="eom-input" value={address} onChange={e => { setAddress(e.target.value); clearErr('address'); }} />
                                </Field>
                                <Field label={t.eomDescription} className="eom-col-2">
                                    <input className="eom-input" value={description} onChange={e => setDescription(e.target.value)} />
                                </Field>
                                <Field label={t.eomPayStatus} required>
                                    <select className="eom-input" value={payStatus} onChange={e => setPayStatus(e.target.value)}>
                                        <option value="NotPaid">{t.eomUnpaid}</option>
                                        <option value="Paid">{t.eomPaid}</option>
                                    </select>
                                </Field>
                                <Field label={t.eomServicePayer} required>
                                    <select className="eom-input" value={payer} onChange={e => setPayer(e.target.value)}>
                                        <option value="Sender">{t.eomPayerSender}</option>
                                        <option value="Recipient">{t.eomPayerRecipient}</option>
                                    </select>
                                </Field>
                                {/* COD (package price) and company service price shown side by side
                                    so the admin can tell which to fix — a customer COD mistake vs. a
                                    wrong service fee. Both are independent values. */}
                                {payStatus === 'NotPaid' && (
                                    <Field label={t.eomCodAmount} error={errors.codAmount}>
                                        <div className="eom-currency-wrap">
                                            <span className="eom-currency">₾</span>
                                            <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={codAmount} onChange={e => { setCodAmount(e.target.value); clearErr('codAmount'); }} placeholder="0.00" />
                                        </div>
                                    </Field>
                                )}
                                <Field label={t.eomSvcPrice} required error={errors.svcPrice}>
                                    <div className="eom-currency-wrap">
                                        <span className="eom-currency">₾</span>
                                        <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={svcPrice} onChange={e => { setSvcPrice(e.target.value); clearErr('svcPrice'); }} placeholder="0.00" />
                                    </div>
                                </Field>
                                <Field label={t.eomFragile} className="eom-col-2">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                        <input type="checkbox" checked={isFragile} onChange={e => setIsFragile(e.target.checked)} />
                                        <span style={{ fontSize: '0.875rem' }}>{t.eomFragileContains}</span>
                                    </label>
                                </Field>
                            </div>
                        </fieldset>
                    )}

                    {/* ── Type & Status tab ──────────────────────────────────── */}
                    {activeTab === 'type' && (
                        <>
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.eomLegendOrderType}</legend>
                                <div className="eom-type-row">
                                    {ORDER_TYPE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`eom-toggle-btn${orderType === opt.value ? ' eom-toggle-btn--active' : ''}`}
                                            style={orderType === opt.value ? { borderColor: opt.color, color: opt.color, background: `${opt.color}15` } : {}}
                                            onClick={() => setOrderType(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                                    {orderType === 'Return'   && t.eomOrderTypeReturnDesc}
                                    {orderType === 'Exchange' && t.eomOrderTypeExchangeDesc}
                                    {orderType === 'Send'     && t.eomOrderTypeSendDesc}
                                </p>
                            </fieldset>

                            {/* Return pickup address */}
                            {isReturn && (
                                <fieldset className="modal__fieldset" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
                                    <legend className="modal__legend" style={{ color: '#ef4444' }}>{t.eomLegendReturnPickup}</legend>
                                    <div className="eom-grid">
                                        <Field label={t.eomReturnCityDistrict} required className="eom-col-2">
                                            <CityDistrictPicker
                                                cityValue={returnCity}
                                                districtValue={returnDistrict}
                                                onCityChange={v => { setReturnCity(v); setReturnDistrict(''); clearErr('returnCity'); clearErr('returnDistrict'); }}
                                                onDistrictChange={v => { setReturnDistrict(v); clearErr('returnDistrict'); }}
                                                onDistrictSelect={() => {}}
                                                cityError={errors.returnCity}
                                                districtError={errors.returnDistrict}
                                            />
                                        </Field>
                                        <Field label={t.streetAddress} required className="eom-col-2" error={errors.returnAddress}>
                                            <input
                                                className="eom-input"
                                                value={returnAddress}
                                                onChange={e => { setReturnAddress(e.target.value); clearErr('returnAddress'); }}
                                                placeholder={t.eomReturnAddressPh}
                                            />
                                        </Field>
                                    </div>
                                </fieldset>
                            )}

                            {/* Status override */}
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">{t.eomLegendTerminalStatus}</legend>
                                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10 }}>
                                    {t.eomTerminalStatusHint}
                                </p>
                                <div className="eom-type-row">
                                    {STATUS_OVERRIDE_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            className={`eom-toggle-btn${statusOverride === opt.value ? ' eom-toggle-btn--active' : ''}`}
                                            onClick={() => setStatusOverride(opt.value)}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>

                            {/* Correct a courier's mistaken status (un-cancel / un-deliver) */}
                            {(canUnCancel || canUnDeliver) && (
                                <fieldset className="modal__fieldset" style={{ borderColor: 'rgba(196,127,23,0.35)' }}>
                                    <legend className="modal__legend" style={{ color: 'var(--color-accent)' }}>{t.eomLegendCorrectStatus}</legend>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
                                        {t.eomCorrectStatusHint}
                                    </p>
                                    {correctConfirm ? (
                                        <div className="eom-action-confirm">
                                            <span className="eom-action-confirm__label">
                                                {correctConfirm === 'UnCancel' ? t.eomConfirmUnCancel : t.eomConfirmUnDeliver}
                                            </span>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    type="button"
                                                    className="eom-action-btn eom-action-btn--ghost"
                                                    disabled={correctBusy}
                                                    onClick={() => { setCorrectConfirm(null); setCorrectError(null); }}
                                                >
                                                    {t.cancel}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="eom-action-btn eom-action-btn--warehouse"
                                                    disabled={correctBusy}
                                                    onClick={() => void handleCorrect(correctConfirm)}
                                                >
                                                    {correctBusy ? '…' : t.goConfirm}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="eom-type-row">
                                            {canUnCancel && (
                                                <button type="button" className="eom-toggle-btn" onClick={() => { setCorrectConfirm('UnCancel'); setCorrectError(null); }}>
                                                    {t.eomUnCancel}
                                                </button>
                                            )}
                                            {canUnDeliver && (
                                                <button type="button" className="eom-toggle-btn" onClick={() => { setCorrectConfirm('UnDeliver'); setCorrectError(null); }}>
                                                    {t.eomUnDeliver}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {correctError && (
                                        <div style={{ fontSize: '0.78rem', color: '#ef4444', marginTop: 8 }}>{correctError}</div>
                                    )}
                                </fieldset>
                            )}
                        </>
                    )}

                    {/* ── Financials tab ─────────────────────────────────── */}
                    {activeTab === 'financials' && (
                        <fieldset className="modal__fieldset">
                            <legend className="modal__legend">{t.eomLegendFinancials}</legend>
                            <div className="eom-grid">
                                {/* Company service price is edited on the Delivery tab, alongside the
                                    COD, so the two are clearly separate. Salary/revenue stay here. */}
                                <Field label={t.eomCourierSalary} error={errors.salary}>
                                    <div className="eom-currency-wrap">
                                        <span className="eom-currency">₾</span>
                                        <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={salary} onChange={e => { setSalary(e.target.value); clearErr('salary'); }} placeholder="0.00" />
                                    </div>
                                </Field>
                                {svcPrice && salary && (
                                    <div className="eom-col-2 eom-revenue-preview">
                                        <span>{t.eomRevenuePreview}</span>
                                        <strong style={{ color: (parseFloat(svcPrice) - parseFloat(salary)) >= 0 ? '#10b981' : '#ef4444' }}>
                                            ₾{(parseFloat(svcPrice || '0') - parseFloat(salary || '0')).toFixed(2)}
                                        </strong>
                                        <span className="eom-hint">{t.eomRevenueHint}</span>
                                    </div>
                                )}
                                <div className="eom-col-2">
                                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={svcIncluded}
                                            onChange={e => {
                                                // The COD field stays product-only regardless; this flag only controls
                                                // whether the fee is bundled into the price shown to the recipient.
                                                setSvcIncluded(e.target.checked);
                                                clearErr('codAmount');
                                            }}
                                        />
                                        <span style={{ fontSize: '0.82rem', lineHeight: 1.4 }}>
                                            {t.cgoServiceIncluded}
                                            <br />
                                            <span className="eom-hint">{t.cgoServiceIncludedHint}</span>
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </fieldset>
                    )}
                </div>

                {/* Status actions panel */}
                {(canMarkDelivered || canMarkWarehouse) && (
                    <div className="eom-actions-panel">
                        {actionError && (
                            <div style={{ fontSize: '0.78rem', color: '#ef4444', marginBottom: 8 }}>{actionError}</div>
                        )}

                        {actionConfirm ? (
                            <div className="eom-action-confirm">
                                <span className="eom-action-confirm__label">
                                    {actionConfirm === 'delivered' ? t.eomConfirmDelivered : t.eomConfirmWarehouse}
                                </span>

                                {/* Optional courier assignment for unassigned delivered orders */}
                                {actionConfirm === 'delivered' && !order?.courierId && couriers.length > 0 && (
                                    <select
                                        className="eom-input eom-action-courier-select"
                                        value={actionCourierId}
                                        onChange={e => setActionCourierId(e.target.value)}
                                    >
                                        <option value="">{t.eomSkipNoCourier}</option>
                                        {couriers.map(c => (
                                            <option key={c.courierId} value={c.courierId}>
                                                {c.fullName} — {c.assignedCity}, {c.assignedDistrict}
                                            </option>
                                        ))}
                                    </select>
                                )}

                                {/* Required salary input when order has no salary set */}
                                {needsSalary && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#ef4444', whiteSpace: 'nowrap' }}>
                                            {t.eomSalaryRequired}
                                        </span>
                                        <div className="eom-currency-wrap" style={{ width: 100 }}>
                                            <span className="eom-currency">₾</span>
                                            <input
                                                className="eom-input eom-input--currency"
                                                type="number" min="0" step="0.01" placeholder="0.00"
                                                value={actionSalary}
                                                onChange={e => setActionSalary(e.target.value)}
                                                style={{ padding: '5px 8px 5px 22px', fontSize: '0.82rem' }}
                                                autoFocus
                                            />
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button
                                        type="button"
                                        className="eom-action-btn eom-action-btn--ghost"
                                        disabled={actionBusy}
                                        onClick={() => { setActionConfirm(null); setActionCourierId(''); setActionSalary(''); setActionError(null); }}
                                    >
                                        {t.cancel}
                                    </button>
                                    <button
                                        type="button"
                                        className={`eom-action-btn${actionConfirm === 'delivered' ? ' eom-action-btn--delivered' : ' eom-action-btn--warehouse'}`}
                                        disabled={actionBusy || !canConfirm}
                                        title={!canConfirm ? t.eomSalaryHint : undefined}
                                        onClick={() => void handleAction()}
                                    >
                                        {actionBusy ? '…' : t.goConfirm}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-subtle)', marginRight: 4 }}>
                                    {t.eomMarkAsLabel}
                                </span>
                                {canMarkDelivered && (
                                    <button
                                        type="button"
                                        className="eom-action-btn eom-action-btn--delivered"
                                        onClick={() => setActionConfirm('delivered')}
                                    >
                                        {t.eomMarkDelivered}
                                    </button>
                                )}
                                {canMarkWarehouse && (
                                    <button
                                        type="button"
                                        className="eom-action-btn eom-action-btn--warehouse"
                                        onClick={() => setActionConfirm('warehouse')}
                                    >
                                        {t.eomMarkWarehouse}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="modal__footer" style={{ padding: '16px 24px' }}>
                    <button type="button" className="modal__btn-cancel" onClick={onClose} disabled={saving}>{t.cancel}</button>
                    <button type="button" className="modal__btn-submit" onClick={handleSave} disabled={saving}>
                        {saving ? <><span className="btn__spinner" />{t.eomSaving}</> : <>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            {t.eomSaveChanges}
                        </>}
                    </button>
                </div>
            </div>

            <style>{`
                .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
                .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22);animation:modal-slide-up 0.22s ease both; }
                .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
                .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
                .modal__title { font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:var(--color-text);margin:0;display:flex;align-items:center;gap:8px; }
                .modal__close { width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--color-bg-3);border:1px solid var(--color-border);border-radius:var(--radius-sm);cursor:pointer;color:var(--color-text-muted);transition:background var(--transition); }
                .modal__close:hover { background:var(--color-border); }
                .modal__body { padding:20px 24px;display:flex;flex-direction:column;gap:14px; }
                .modal__fieldset { border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:14px 16px;margin:0; }
                .modal__legend { font-size:0.68rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:var(--color-text-subtle);padding:0 6px; }
                .modal__global-error { display:flex;align-items:center;gap:8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:var(--radius-sm);color:#ef4444;font-size:0.825rem;padding:10px 14px; }
                .modal__footer { display:flex;align-items:center;justify-content:flex-end;gap:10px;border-top:1px solid var(--color-border); }
                .modal__btn-cancel { padding:10px 20px;background:transparent;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;color:var(--color-text-muted);cursor:pointer; }
                .modal__btn-cancel:hover:not(:disabled) { background:var(--color-bg-3); }
                .modal__btn-cancel:disabled { opacity:0.5;cursor:not-allowed; }
                .modal__btn-submit { display:inline-flex;align-items:center;gap:7px;padding:10px 22px;background:var(--color-accent);border:none;border-radius:var(--radius-md);font-size:0.875rem;font-weight:600;color:#fff;cursor:pointer;transition:background var(--transition); }
                .modal__btn-submit:hover:not(:disabled) { background:#d4891a; }
                .modal__btn-submit:disabled { opacity:0.6;cursor:not-allowed; }
                .btn__spinner { display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.35);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite; }
                @keyframes modal-fade-in { from{opacity:0} to{opacity:1} }
                @keyframes modal-slide-up { from{opacity:0;transform:translate(-50%,calc(-50% + 12px))} to{opacity:1;transform:translate(-50%,-50%)} }
                @keyframes spin { to{transform:rotate(360deg)} }

                .edit-order-modal { width:min(640px,calc(100vw - 32px)); }
                .eom-tabs { display:flex;gap:0;border-bottom:1px solid var(--color-border);padding:0 24px;position:sticky;top:81px;background:var(--color-bg-2);z-index:1; }
                .eom-tab { display:flex;align-items:center;gap:7px;padding:12px 16px;background:none;border:none;border-bottom:2px solid transparent;font-size:0.82rem;font-weight:600;color:var(--color-text-subtle);cursor:pointer;transition:all var(--transition);margin-bottom:-1px; }
                .eom-tab:hover { color:var(--color-text); }
                .eom-tab--active { color:var(--color-accent);border-bottom-color:var(--color-accent); }
                .eom-grid { display:grid;grid-template-columns:1fr 1fr;gap:12px; }
                .eom-col-2 { grid-column:span 2; }
                .eom-field { display:flex;flex-direction:column;gap:4px; }
                .eom-label { font-size:0.7rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--color-text-subtle); }
                .eom-label--required::after { content:' *';color:var(--color-accent); }
                .eom-input { background:var(--color-bg);border:1px solid var(--color-border);border-radius:var(--radius-sm);color:var(--color-text);font-size:0.875rem;padding:8px 10px;outline:none;width:100%;box-sizing:border-box;transition:border-color var(--transition);font-family:var(--font-body); }
                .eom-input:focus { border-color:var(--color-accent); }
                .eom-field--error .eom-input { border-color:#ef4444; }
                .eom-field-error { font-size:0.72rem;color:#ef4444;font-weight:500; }
                .eom-currency-wrap { position:relative;display:flex;align-items:center; }
                .eom-currency { position:absolute;left:10px;font-size:0.85rem;color:var(--color-text-subtle);pointer-events:none; }
                .eom-input--currency { padding-left:24px; }
                .eom-type-row { display:flex;gap:6px;flex-wrap:wrap; }
                .eom-toggle-btn { padding:7px 14px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-bg-3);color:var(--color-text-subtle);font-size:0.8rem;font-weight:600;cursor:pointer;transition:all var(--transition);display:flex;align-items:center;gap:5px; }
                .eom-toggle-btn--active { background:var(--color-accent-dim);border-color:rgba(196,127,23,0.4);color:var(--color-accent); }
                .eom-revenue-preview { font-size:0.82rem;color:var(--color-text-subtle);padding:8px 10px;background:var(--color-bg-3);border-radius:var(--radius-sm);border:1px solid var(--color-border);display:flex;align-items:center;gap:6px;flex-wrap:wrap; }
                .eom-hint { font-style:italic;font-size:0.75rem; }

                .eom-actions-panel { padding:12px 24px;border-top:1px solid var(--color-border);background:var(--color-bg-3); }
                .eom-action-confirm { display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
                .eom-action-confirm__label { font-size:0.82rem;font-weight:600;color:var(--color-text);flex-shrink:0; }
                .eom-action-courier-select { flex:1;min-width:180px;font-size:0.8rem;padding:6px 8px; }
                .eom-action-btn { padding:6px 14px;border-radius:var(--radius-sm);font-size:0.78rem;font-weight:600;cursor:pointer;border:none;white-space:nowrap;transition:opacity 0.15s; }
                .eom-action-btn:disabled { opacity:0.5;cursor:not-allowed; }
                .eom-action-btn--delivered { background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.35); }
                .eom-action-btn--delivered:hover:not(:disabled) { background:rgba(16,185,129,0.2); }
                .eom-action-btn--warehouse { background:rgba(249,115,22,0.12);color:#f97316;border:1px solid rgba(249,115,22,0.35); }
                .eom-action-btn--warehouse:hover:not(:disabled) { background:rgba(249,115,22,0.2); }
                .eom-action-btn--ghost { background:var(--color-bg-2);color:var(--color-text-subtle);border:1px solid var(--color-border); }
                .eom-action-btn--ghost:hover:not(:disabled) { color:var(--color-text); }
            `}</style>
        </>,
        document.body
    );
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function Field({ label, required, className, error, children }: {
    label: string; required?: boolean; className?: string; error?: string; children: React.ReactNode;
}) {
    return (
        <div className={`eom-field${className ? ` ${className}` : ''}${error ? ' eom-field--error' : ''}`}>
            <label className={`eom-label${required ? ' eom-label--required' : ''}`}>{label}</label>
            {children}
            {error && <span className="eom-field-error">{error}</span>}
        </div>
    );
}
