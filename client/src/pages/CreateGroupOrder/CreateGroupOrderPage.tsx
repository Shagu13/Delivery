import { useState, useCallback, useRef, useEffect } from 'react';
import { createGroupOrder, downloadExcelTemplate, parseGroupOrderExcel, ApiError } from '../../api/groupOrders';
import { getMyProfile } from '../../api/customers';
import type {
    CreateGroupOrderRequest,
    CreateGroupOrderResponse,
    OrderItemRequest,
    ValidationErrors,
} from '../../types/groupOrder';
import { useAuth } from '../../contexts/useAuth';
import { SenderSection } from './SenderSection';
import { PackageCard } from './PackageCard';
import { SuccessView } from './SuccessView';
import './createGroupOrder.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SenderFormData {
    senderFirstName:    string;
    senderLastName:     string;
    senderIdNumber?:    string;
    senderBusinessName: string;
    senderPhone:        string;
    // Stored registered address (never changes unless they update profile)
    registeredCity:     string;
    registeredDistrict: string;
    registeredAddress:  string;
    // Actual pick-up address for this order — defaults to registered, overridable
    pickUpCity:         string;
    pickUpDistrict:     string;
    pickUpAddress:      string;
    note:               string;
}

const EMPTY_SENDER: SenderFormData = {
    senderFirstName:    '',
    senderLastName:     '',
    senderIdNumber:     '',
    senderBusinessName: '',
    senderPhone:        '',
    registeredCity:     '',
    registeredDistrict: '',
    registeredAddress:  '',
    pickUpCity:         '',
    pickUpDistrict:     '',
    pickUpAddress:      '',
    note:               '',
};

const EMPTY_PACKAGE: OrderItemRequest = {
    recipientFirstName:      '',
    recipientLastName:       '',
    recipientPhone:          '',
    recipientCity:           '',
    recipientDistrict:       '',
    recipientAddress:        '',
    description:             '',
    isFragile:               false,
    productPaymentStatus:    'NotPaid',
    whoPaysForCompanyService: 'Sender',
};

// ── Validation ────────────────────────────────────────────────────────────────

function validate(sender: SenderFormData, packages: OrderItemRequest[]): ValidationErrors {
    const errors: ValidationErrors = {};

    const req = (key: string, val: string, label: string) => {
        if (!val.trim()) errors[key] = `${label} is required.`;
    };

    req('senderFirstName',    sender.senderFirstName,    'First name');
    req('senderLastName',     sender.senderLastName,     'Last name');
    req('senderBusinessName', sender.senderBusinessName, 'Business or page name');
    req('senderPhone',        sender.senderPhone,        'Phone number');
    req('pickUpCity',         sender.pickUpCity,         'City');
    req('pickUpDistrict',     sender.pickUpDistrict,     'District');
    req('pickUpAddress',      sender.pickUpAddress,      'Street address');

    if (sender.note.length > 500) errors.note = 'Note cannot exceed 500 characters.';

    packages.forEach((pkg, i) => {
        const p = (field: string, val: string, label: string) => {
            if (!val.trim()) errors[`orders[${i}].${field}`] = `${label} is required.`;
        };
        p('recipientFirstName', pkg.recipientFirstName, 'First name');
        p('recipientLastName',  pkg.recipientLastName,  'Last name');
        p('recipientPhone',     pkg.recipientPhone,     'Phone number');
        p('recipientCity',      pkg.recipientCity,      'City');
        p('recipientDistrict',  pkg.recipientDistrict,  'District');
        p('recipientAddress',   pkg.recipientAddress,   'Street address');
    });

    return errors;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateGroupOrderPage() {
    const { user, token } = useAuth();

    const [sender,       setSender]       = useState<SenderFormData>(EMPTY_SENDER);
    const [useOtherAddr, setUseOtherAddr] = useState(false);
    const [packages,     setPackages]     = useState<OrderItemRequest[]>([{ ...EMPTY_PACKAGE }]);
    const [errors,       setErrors]       = useState<ValidationErrors>({});
    const [submitting,   setSubmitting]   = useState(false);
    const [globalError,  setGlobalError]  = useState<string | null>(null);
    const [result,       setResult]       = useState<CreateGroupOrderResponse | null>(null);

    const [excelImporting, setExcelImporting] = useState(false);
    const [excelError,     setExcelError]     = useState<string | null>(null);
    const [importedCount,  setImportedCount]  = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prefilled, setPrefilled] = useState(false);

    // ── Pre-fill from customer profile ────────────────────────────────────────
    useEffect(() => {
        if (user?.role !== 'Customer' || !token) return;

        let cancelled = false;
        (async () => {
            try {
                const profile = await getMyProfile(token);
                if (cancelled) return;

                setSender(prev => ({
                    ...prev,
                    senderFirstName:    profile.firstName,
                    senderLastName:     profile.lastName,
                    senderIdNumber:     profile.idNumber ?? '',
                    senderBusinessName: profile.businessName,
                    senderPhone:        profile.phoneNumber,
                    registeredCity:     profile.city,
                    registeredDistrict: profile.district,
                    registeredAddress:  profile.address,
                    // Default pickup = registered address
                    pickUpCity:         profile.city,
                    pickUpDistrict:     profile.district,
                    pickUpAddress:      profile.address,
                }));
                setPrefilled(true);
            } catch {
                // silently ignore
            }
        })();

        return () => { cancelled = true; };
    }, [user?.role, token]);

    // ── When user toggles "Use Other Address" ─────────────────────────────────
    const handleUseOtherAddrChange = (checked: boolean) => {
        setUseOtherAddr(checked);
        if (!checked) {
            // Revert pickup address back to registered address
            setSender(prev => ({
                ...prev,
                pickUpCity:     prev.registeredCity,
                pickUpDistrict: prev.registeredDistrict,
                pickUpAddress:  prev.registeredAddress,
            }));
        }
    };

    // ── Sender handlers ───────────────────────────────────────────────────────
    const handleSenderChange = useCallback((field: keyof SenderFormData, value: string) => {
        setSender(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }, []);

    // ── Package handlers ──────────────────────────────────────────────────────
    const handlePackageChange = useCallback(
        (index: number, field: keyof OrderItemRequest, value: string | boolean) => {
            setPackages(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
            setErrors(prev => {
                const n = { ...prev };
                delete n[`orders[${index}].${field}`];
                return n;
            });
        },
        [],
    );

    const addPackage = () => {
        if (packages.length >= 100) return;
        setPackages(prev => [...prev, { ...EMPTY_PACKAGE }]);
    };

    const removePackage = useCallback((index: number) => {
        setPackages(prev => prev.filter((_, i) => i !== index));
        setErrors(prev => {
            const next: ValidationErrors = {};
            Object.keys(prev).forEach(key => {
                const match = key.match(/^orders\[(\d+)\]\./);
                if (match) {
                    const idx = Number(match[1]);
                    if (idx === index) return;
                    const newKey = idx > index ? key.replace(`[${idx}]`, `[${idx - 1}]`) : key;
                    next[newKey] = prev[key];
                } else {
                    next[key] = prev[key];
                }
            });
            return next;
        });
    }, []);

    // ── Excel handlers ────────────────────────────────────────────────────────
    const handleDownloadTemplate = async () => {
        try { await downloadExcelTemplate(); }
        catch { setExcelError('Could not download the template. Please try again.'); }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        setExcelError(null);
        setExcelImporting(true);
        try {
            const parsed = await parseGroupOrderExcel(file);
            const normalised = parsed.map(o => ({
                ...EMPTY_PACKAGE,
                ...o,
                description: o.description ?? '',
            }));
            setPackages(normalised);
            setImportedCount(normalised.length);
            setErrors({});
        } catch (err) {
            setExcelError(err instanceof ApiError
                ? err.message
                : 'Failed to read the file. Make sure you are using the downloaded template.');
        } finally {
            setExcelImporting(false);
        }
    };

    const clearImport = () => {
        setImportedCount(null);
        setExcelError(null);
        setPackages([{ ...EMPTY_PACKAGE }]);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGlobalError(null);

        const validationErrors = validate(sender, packages);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            document.querySelector('.form-field--error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        setSubmitting(true);
        try {
            const payload: CreateGroupOrderRequest = {
                senderFirstName:    sender.senderFirstName,
                senderLastName:     sender.senderLastName,
                senderIdNumber:     sender.senderIdNumber?.trim() || undefined,
                senderBusinessName: sender.senderBusinessName,
                senderPhone:        sender.senderPhone,
                pickUpCity:         sender.pickUpCity,
                pickUpDistrict:     sender.pickUpDistrict,
                pickUpAddress:      sender.pickUpAddress,
                note:               sender.note.trim() || undefined,
                orders: packages.map(p => ({
                    ...p,
                    description: p.description?.trim() || undefined,
                })),
                customerId: user?.role === 'Customer' ? user.customerId : undefined,
            };

            const response = await createGroupOrder(payload);
            setResult(response);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.errors) {
                    const mapped: ValidationErrors = {};
                    Object.entries(err.errors).forEach(([key, messages]) => {
                        mapped[key.toLowerCase()] = (messages as string[])[0];
                    });
                    setErrors(mapped);
                }
                setGlobalError(err.message);
            } else {
                setGlobalError('An unexpected error occurred. Please try again.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleNewOrder = () => {
        setResult(null);
        if (user?.role === 'Customer' && token) {
            getMyProfile(token).then(profile => {
                setSender({
                    senderFirstName:    profile.firstName,
                    senderLastName:     profile.lastName,
                    senderIdNumber:     profile.idNumber ?? '',
                    senderBusinessName: profile.businessName,
                    senderPhone:        profile.phoneNumber,
                    registeredCity:     profile.city,
                    registeredDistrict: profile.district,
                    registeredAddress:  profile.address,
                    pickUpCity:         profile.city,
                    pickUpDistrict:     profile.district,
                    pickUpAddress:      profile.address,
                    note:               '',
                });
            }).catch(() => setSender(EMPTY_SENDER));
        } else {
            setSender(EMPTY_SENDER);
        }
        setUseOtherAddr(false);
        setPackages([{ ...EMPTY_PACKAGE }]);
        setErrors({});
        setGlobalError(null);
        setImportedCount(null);
        setExcelError(null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (result) {
        return (
            <div className="page">
                <main className="page__main">
                    <SuccessView result={result} onNewOrder={handleNewOrder} />
                </main>
            </div>
        );
    }

    return (
        <div className="page">
            <main className="page__main">
                <div className="page__intro">
                    <p className="page__eyebrow">Pickup Request</p>
                    <h1 className="page__title">Send Multiple Packages</h1>
                    <p className="page__desc">
                        Fill in your details and list all recipients. We'll generate a unique tracking number
                        for each package.
                    </p>
                </div>

                <form className="order-form" onSubmit={handleSubmit} noValidate>
                    <SenderSection
                        data={sender}
                        errors={errors}
                        onChange={handleSenderChange}
                        prefilled={prefilled}
                        useOtherAddress={useOtherAddr}
                        onUseOtherAddressChange={handleUseOtherAddrChange}
                    />

                    <section className="form-section">
                        <div className="form-section__header">
                            <span className="form-section__number">02</span>
                            <div>
                                <h2 className="form-section__title">Packages</h2>
                                <p className="form-section__desc">
                                    {packages.length} package{packages.length !== 1 ? 's' : ''} — up to 100 per order
                                </p>
                            </div>
                        </div>

                        <div className="form-section__body">
                            {/* Excel Import */}
                            <div className="excel-import">
                                <div className="excel-import__left">
                                    <div className="excel-import__icon" aria-hidden="true">
                                        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                                            <rect x="1" y="1" width="20" height="20" rx="4" fill="#1D6F42" />
                                            <path d="M5 7l3.5 4L5 15h2.5L10 11.8 12.5 15H15l-3.5-4L15 7h-2.5L10 10.2 7.5 7H5z" fill="white" />
                                        </svg>
                                    </div>
                                    <div className="excel-import__info">
                                        <span className="excel-import__title">Bulk import via Excel</span>
                                        <span className="excel-import__desc">Download the template, fill in recipients, then upload.</span>
                                    </div>
                                </div>
                                <div className="excel-import__actions">
                                    {importedCount !== null ? (
                                        <>
                                            <div className="excel-import__badge">
                                                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                                    <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2" />
                                                    <path d="M4 6.5l2 2 3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                                {importedCount} package{importedCount !== 1 ? 's' : ''} imported
                                            </div>
                                            <button type="button" className="excel-import__clear" onClick={clearImport}>
                                                Clear &amp; reset
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="btn excel-import__btn-download" onClick={handleDownloadTemplate}>
                                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                    <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                                Download Template
                                            </button>
                                            <button
                                                type="button"
                                                className="btn excel-import__btn-upload"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={excelImporting}
                                            >
                                                {excelImporting ? (
                                                    <><span className="btn__spinner btn__spinner--dark" />Importing…</>
                                                ) : (
                                                    <>
                                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                            <path d="M7 9V1M4 4l3-3 3 3M2 11h10M2 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                        Upload &amp; Import
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".xlsx"
                                        style={{ display: 'none' }}
                                        onChange={handleFileChange}
                                    />
                                </div>
                                {excelError && (
                                    <div className="excel-import__error">
                                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                                            <circle cx="6.5" cy="6.5" r="6" stroke="currentColor" strokeWidth="1.2" />
                                            <path d="M6.5 4v3M6.5 8.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                                        </svg>
                                        {excelError}
                                    </div>
                                )}
                            </div>

                            <div className="package-list">
                                {packages.map((pkg, i) => (
                                    <PackageCard
                                        key={i}
                                        index={i}
                                        data={pkg}
                                        errors={errors}
                                        canRemove={packages.length > 1}
                                        onChange={handlePackageChange}
                                        onRemove={removePackage}
                                    />
                                ))}
                            </div>

                            {packages.length < 100 && (
                                <button type="button" className="btn btn--add" onClick={addPackage}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                                    </svg>
                                    Add Another Package
                                </button>
                            )}
                        </div>
                    </section>

                    {globalError && (
                        <div className="global-error" role="alert">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                            {globalError}
                        </div>
                    )}

                    <div className="form-footer">
                        <div className="form-footer__summary">
                            <span className="form-footer__count">
                                {packages.length} package{packages.length !== 1 ? 's' : ''}
                            </span>
                            <span className="form-footer__hint">Ready to submit</span>
                        </div>
                        <button type="submit" className="btn btn--primary" disabled={submitting}>
                            {submitting ? (
                                <><span className="btn__spinner" />Placing Order…</>
                            ) : (
                                <>
                                    Place Order
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
