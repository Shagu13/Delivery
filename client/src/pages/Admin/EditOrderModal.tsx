import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { updateOrder } from '../../api/orders';
import type { AdminOrderItem } from './AdminOrdersPage';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';

interface Props {
    order: AdminOrderItem | null;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    token: string;
}

export function EditOrderModal({ order, open, onClose, onSaved, token }: Props) {
    // ── Form state ────────────────────────────────────────────────────────────
    const [firstName,   setFirstName]   = useState('');
    const [lastName,    setLastName]    = useState('');
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
    const [salary,      setSalary]      = useState('');

    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState<string | null>(null);
    const [activeTab,  setActiveTab]  = useState<'delivery' | 'financials'>('delivery');

    // Populate form when order changes
    useEffect(() => {
        if (!order) return;
        setFirstName(order.recipientFirstName);
        setLastName(order.recipientLastName);
        setPhone(order.recipientPhone);
        setCity(order.recipientCity);
        setDistrict(order.recipientDistrict);
        setAddress(order.recipientAddress);
        setDescription(order.description ?? '');
        setIsFragile(order.isFragile);
        setPayer(order.whoPaysForCompanyService);
        setPayStatus(order.productPaymentStatus);
        setCodAmount(order.amountToCollectForPackage != null ? String(order.amountToCollectForPackage) : '');
        setSvcPrice(String(order.companyServicePrice));
        setSalary(order.courierSalary != null ? String(order.courierSalary) : '');
        setError(null);
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

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            await updateOrder(token, order.id, {
                recipientFirstName:        firstName.trim(),
                recipientLastName:         lastName.trim(),
                recipientPhone:            phone.trim(),
                recipientCity:             city.trim(),
                recipientDistrict:         district.trim(),
                recipientAddress:          address.trim(),
                description:               description.trim() || null,
                isFragile,
                whoPaysForCompanyService:  payer,
                productPaymentStatus:      payStatus,
                amountToCollectForPackage: codAmount ? parseFloat(codAmount) : null,
                companyServicePrice:       parseFloat(svcPrice) || 0,
                courierSalary:             salary ? parseFloat(salary) : null,
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
                        <p className="modal__eyebrow">Edit Order</p>
                        <h2 className="modal__title" id="edit-order-title">
                            <span className="tn-badge" style={{ fontSize: '0.85rem', marginRight: 8 }}>{order.trackingNumber}</span>
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
                        Recipient &amp; Package
                    </button>
                    <button className={`eom-tab${activeTab === 'financials' ? ' eom-tab--active' : ''}`} onClick={() => setActiveTab('financials')}>
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
                            <path d="M8 4.5v1M8 10.5v1M5.5 8a2.5 2.5 0 005 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                        </svg>
                        Financials
                    </button>
                </div>

                <div className="modal__body">
                    {error && (
                        <div className="modal__global-error">
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4"/>
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                            </svg>
                            {error}
                        </div>
                    )}

                    {/* ── Delivery tab ───────────────────────────────────── */}
                    {activeTab === 'delivery' && (
                        <>
                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Recipient Info</legend>
                                <div className="eom-grid">
                                    <Field label="First Name" required>
                                        <input className="eom-input" value={firstName} onChange={e => setFirstName(e.target.value)} />
                                    </Field>
                                    <Field label="Last Name" required>
                                        <input className="eom-input" value={lastName} onChange={e => setLastName(e.target.value)} />
                                    </Field>
                                    <Field label="Phone" required>
                                        <input className="eom-input" value={phone} onChange={e => setPhone(e.target.value)} />
                                    </Field>
                                </div>
                                <CityDistrictPicker
                                    cityValue={city}
                                    districtValue={district}
                                    onCityChange={val => { setCity(val); setDistrict(''); }}
                                    onDistrictChange={setDistrict}
                                />
                                <div className="eom-grid">
                                    <Field label="Address" required className="eom-col-2">
                                        <input className="eom-input" value={address} onChange={e => setAddress(e.target.value)} />
                                    </Field>
                                </div>
                            </fieldset>

                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Package Details</legend>
                                <div className="eom-grid">
                                    <Field label="Description" className="eom-col-2">
                                        <input className="eom-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" />
                                    </Field>
                                    <Field label="Fragile?">
                                        <div className="eom-toggle-row">
                                            <ToggleBtn active={!isFragile} onClick={() => setIsFragile(false)}>No</ToggleBtn>
                                            <ToggleBtn active={isFragile} onClick={() => setIsFragile(true)}>
                                                <span style={{ color: '#f97316' }}>⚠</span> Yes
                                            </ToggleBtn>
                                        </div>
                                    </Field>
                                </div>
                            </fieldset>

                            <fieldset className="modal__fieldset">
                                <legend className="modal__legend">Payment</legend>
                                <div className="eom-grid">
                                    <Field label="Who pays service fee?">
                                        <div className="eom-toggle-row">
                                            <ToggleBtn active={payer === 'Sender'} onClick={() => setPayer('Sender')}>Sender</ToggleBtn>
                                            <ToggleBtn active={payer === 'Recipient'} onClick={() => setPayer('Recipient')}>Recipient</ToggleBtn>
                                        </div>
                                    </Field>
                                    <Field label="Product payment status">
                                        <div className="eom-toggle-row">
                                            <ToggleBtn active={payStatus === 'NotPaid'} onClick={() => setPayStatus('NotPaid')}>Unpaid</ToggleBtn>
                                            <ToggleBtn active={payStatus === 'Paid'} onClick={() => setPayStatus('Paid')}>
                                                <span style={{ color: '#10b981' }}>✓</span> Paid
                                            </ToggleBtn>
                                        </div>
                                    </Field>
                                    <Field label="COD amount (₾)">
                                        <div className="eom-currency-wrap">
                                            <span className="eom-currency">₾</span>
                                            <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={codAmount} onChange={e => setCodAmount(e.target.value)} placeholder="0.00" />
                                        </div>
                                    </Field>
                                </div>
                            </fieldset>
                        </>
                    )}

                    {/* ── Financials tab ─────────────────────────────────── */}
                    {activeTab === 'financials' && (
                        <fieldset className="modal__fieldset">
                            <legend className="modal__legend">Financial Fields</legend>
                            <div className="eom-grid">
                                <Field label="Company Service Price (₾)" required>
                                    <div className="eom-currency-wrap">
                                        <span className="eom-currency">₾</span>
                                        <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={svcPrice} onChange={e => setSvcPrice(e.target.value)} />
                                    </div>
                                </Field>
                                <Field label="Courier Salary (₾)">
                                    <div className="eom-currency-wrap">
                                        <span className="eom-currency">₾</span>
                                        <input className="eom-input eom-input--currency" type="number" min="0" step="0.01" value={salary} onChange={e => setSalary(e.target.value)} placeholder="0.00" />
                                    </div>
                                </Field>
                                {svcPrice && salary && (
                                    <div className="eom-col-2 eom-revenue-preview">
                                        <span>Company Revenue = </span>
                                        <strong style={{ color: (parseFloat(svcPrice) - parseFloat(salary)) >= 0 ? '#10b981' : '#ef4444' }}>
                                            ₾{(parseFloat(svcPrice || '0') - parseFloat(salary || '0')).toFixed(2)}
                                        </strong>
                                        <span className="eom-hint"> (auto-calculated on save)</span>
                                    </div>
                                )}
                            </div>
                        </fieldset>
                    )}
                </div>

                {/* Footer */}
                <div className="modal__footer" style={{ padding: '16px 24px' }}>
                    <button type="button" className="modal__btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
                    <button type="button" className="modal__btn-submit" onClick={handleSave} disabled={saving}>
                        {saving ? <><span className="btn__spinner" />Saving…</> : <>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Save Changes
                        </>}
                    </button>
                </div>
            </div>

            <style>{`
                .modal-backdrop { position:fixed;inset:0;background:rgba(26,23,20,0.55);backdrop-filter:blur(4px);z-index:100;animation:modal-fade-in 0.18s ease both; }
                .modal { position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:101;max-height:calc(100dvh - 48px);overflow-y:auto;background:var(--color-bg-2);border:1px solid var(--color-border);border-radius:var(--radius-lg);box-shadow:0 20px 60px rgba(0,0,0,0.22);animation:modal-slide-up 0.22s ease both; }
                .modal__header { display:flex;align-items:flex-start;justify-content:space-between;padding:24px 24px 20px;border-bottom:1px solid var(--color-border);position:sticky;top:0;background:var(--color-bg-2);z-index:1; }
                .modal__eyebrow { font-size:0.68rem;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--color-accent);margin-bottom:4px; }
                .modal__title { font-family:var(--font-display);font-size:1.1rem;font-weight:800;color:var(--color-text);margin:0;display:flex;align-items:center; }
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
                .eom-currency-wrap { position:relative;display:flex;align-items:center; }
                .eom-currency { position:absolute;left:10px;font-size:0.85rem;color:var(--color-text-subtle);pointer-events:none; }
                .eom-input--currency { padding-left:24px; }
                .eom-toggle-row { display:flex;gap:6px; }
                .eom-toggle-btn { padding:7px 14px;border:1px solid var(--color-border);border-radius:var(--radius-sm);background:var(--color-bg-3);color:var(--color-text-subtle);font-size:0.8rem;font-weight:600;cursor:pointer;transition:all var(--transition);display:flex;align-items:center;gap:5px; }
                .eom-toggle-btn--active { background:var(--color-accent-dim);border-color:rgba(196,127,23,0.4);color:var(--color-accent); }
                .eom-revenue-preview { font-size:0.82rem;color:var(--color-text-subtle);padding:8px 10px;background:var(--color-bg-3);border-radius:var(--radius-sm);border:1px solid var(--color-border);display:flex;align-items:center;gap:6px;flex-wrap:wrap; }
                .eom-hint { font-style:italic;font-size:0.75rem; }
            `}</style>
        </>,
        document.body
    );
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function Field({ label, required, className, children }: {
    label: string; required?: boolean; className?: string; children: React.ReactNode;
}) {
    return (
        <div className={`eom-field${className ? ` ${className}` : ''}`}>
            <label className={`eom-label${required ? ' eom-label--required' : ''}`}>{label}</label>
            {children}
        </div>
    );
}

function ToggleBtn({ active, onClick, children }: {
    active: boolean; onClick: () => void; children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            className={`eom-toggle-btn${active ? ' eom-toggle-btn--active' : ''}`}
            onClick={onClick}
        >
            {children}
        </button>
    );
}
