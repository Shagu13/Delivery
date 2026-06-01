import { useState, useCallback, useRef, useEffect } from 'react';
import { createGroupOrder, downloadExcelTemplate, parseGroupOrderExcel, ApiError } from '../../api/groupOrders';
import { getMyProfile } from '../../api/customers';
import type { Customer } from '../../api/customers';
import { fetchCities, fetchDistricts, fetchAllDistrictsFlat } from '../../api/cities';
import type { City, District } from '../../api/cities';
import { fetchWeightPriceTiers } from '../../api/weightPriceTiers';
import type { WeightPriceTier } from '../../api/weightPriceTiers';
import type {
    CreateGroupOrderRequest,
    CreateGroupOrderResponse,
    OrderItemRequest,
    ValidationErrors,
} from '../../types/groupOrder';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import type { Translations } from '../../contexts/translations';
import { SenderSection } from './SenderSection';
import { PackageCard } from './PackageCard';
import { PackageSidebarLayout } from './PackageSidebarLayout';
import { SuccessView } from './SuccessView';
import { PickupAddressModal } from './PickupAddressModal';
import './createGroupOrder.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type PackageLayout = 'cards' | 'sidebar';

interface SenderFormData {
    senderFirstName:    string;
    senderLastName:     string;
    senderIdNumber?:    string;
    senderBusinessName: string;
    senderPhone:        string;
    registeredCity:     string;
    registeredDistrict: string;
    registeredAddress:  string;
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
    recipientFirstName:           '',
    recipientLastName:            '',
    recipientPhone:               '',
    recipientCity:                '',
    recipientDistrict:            '',
    recipientAddress:             '',
    description:                  '',
    isFragile:                    false,
    productPaymentStatus:         'NotPaid',
    whoPaysForCompanyService:     'Recipient',
    orderType:                    'Send',
    returnPickupAddress:          undefined,
    returnPickupCity:             undefined,
    returnPickupDistrict:         undefined,
    amountToCollectForPackage:    undefined,
    weightPriceTierId:            undefined,
};

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
    sender: SenderFormData,
    packages: OrderItemRequest[],
    cities: City[],
    cityDistrictCache: Record<string, Set<string>>,
    t: Translations,
): ValidationErrors {
    const errors: ValidationErrors = {};

    const req = (key: string, val: string, errMsg: string) => {
        if (!val.trim()) errors[key] = errMsg;
    };

    req('senderFirstName',    sender.senderFirstName,    t.cgoErrFirstName);
    req('senderLastName',     sender.senderLastName,     t.cgoErrLastName);
    req('senderBusinessName', sender.senderBusinessName, t.cgoErrBusinessName);
    req('senderPhone',        sender.senderPhone,        t.cgoErrPhone);
    req('pickUpCity',         sender.pickUpCity,         t.cgoErrCity);
    req('pickUpDistrict',     sender.pickUpDistrict,     t.cgoErrDistrict);
    req('pickUpAddress',      sender.pickUpAddress,      t.cgoErrAddress);

    if (sender.note.length > 500) errors.note = t.cgoErrNoteMax;

    packages.forEach((pkg, i) => {
        const p = (field: string, val: string, errMsg: string) => {
            if (!val.trim()) errors[`orders[${i}].${field}`] = errMsg;
        };
        p('recipientPhone',   pkg.recipientPhone,   t.cgoErrPhone);
        p('recipientAddress', pkg.recipientAddress, t.cgoErrAddress);

        if (!pkg.recipientCity.trim()) {
            errors[`orders[${i}].recipientCity`] = t.cgoErrCity;
        } else if (cities.length > 0 && !cities.some(
            c => c.cityName === pkg.recipientCity || c.cityNameGeo === pkg.recipientCity
        )) {
            errors[`orders[${i}].recipientCity`] = t.cgoErrInvalidCity(pkg.recipientCity);
        }

        if (!pkg.recipientDistrict.trim()) {
            errors[`orders[${i}].recipientDistrict`] = t.cgoErrDistrict;
        } else if (
            cityDistrictCache[pkg.recipientCity] &&
            !cityDistrictCache[pkg.recipientCity].has(pkg.recipientDistrict)
        ) {
            errors[`orders[${i}].recipientDistrict`] =
                t.cgoErrInvalidDistrict(pkg.recipientDistrict, pkg.recipientCity);
        }

        if (pkg.productPaymentStatus === 'NotPaid') {
            if (!pkg.amountToCollectForPackage || pkg.amountToCollectForPackage <= 0) {
                errors[`orders[${i}].amountToCollectForPackage`] = t.cgoErrParcelPrice;
            }
            if (!pkg.companyServicePrice || pkg.companyServicePrice <= 0) {
                errors[`orders[${i}].companyServicePrice`] = t.cgoErrServiceFee;
            }
        }

        if (pkg.orderType === 'Return') {
            if (!pkg.returnPickupCity?.trim())
                errors[`orders[${i}].returnPickupCity`] = t.cgoErrCity;
            if (!pkg.returnPickupDistrict?.trim())
                errors[`orders[${i}].returnPickupDistrict`] = t.cgoErrDistrict;
            if (!pkg.returnPickupAddress?.trim())
                errors[`orders[${i}].returnPickupAddress`] = t.cgoErrAddress;
        }
    });

    return errors;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CreateGroupOrderPage() {
    const { user, token } = useAuth();
    const { t, lang } = useLanguage();

    const [sender,       setSender]       = useState<SenderFormData>(EMPTY_SENDER);
    const [useOtherAddr, setUseOtherAddr] = useState(false);
    const [packages,     setPackages]     = useState<OrderItemRequest[]>([{ ...EMPTY_PACKAGE }]);
    const [errors,       setErrors]       = useState<ValidationErrors>({});
    const [submitting,   setSubmitting]   = useState(false);
    const [globalError,  setGlobalError]  = useState<string | null>(null);
    const [result,       setResult]       = useState<CreateGroupOrderResponse | null>(null);
    const [customerPricing, setCustomerPricing] = useState<Pick<Customer, 'companyServiceCapitalPrice' | 'companyServiceCityPrice' | 'companyServiceDistrictPrice'> | null>(null);
    const [senderAddress, setSenderAddress] = useState<{ city: string; district: string; address: string } | null>(null);

    const [excelImporting, setExcelImporting] = useState(false);
    const [excelError,     setExcelError]     = useState<string | null>(null);
    const [importedCount,  setImportedCount]  = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prefilled,       setPrefilled]       = useState(false);
    const [pickupModalOpen, setPickupModalOpen] = useState(false);

    // ── Layout switcher ────────────────────────────────────────────────────────
    const [layout, setLayout] = useState<PackageLayout>('cards');

    // ── Weight price tiers ─────────────────────────────────────────────────────
    const [weightTiers, setWeightTiers] = useState<WeightPriceTier[]>([]);
    useEffect(() => { fetchWeightPriceTiers().then(setWeightTiers).catch(() => {}); }, []);

    // ── City / district cache for frontend validation ─────────────────────────
    const [cities,            setCities]            = useState<City[]>([]);
    const [cityDistrictCache, setCityDistrictCache] = useState<Record<string, Set<string>>>({});
    const [districtLookup,    setDistrictLookup]    = useState<Record<string, District>>({});
    useEffect(() => { fetchCities().then(setCities).catch(() => {}); }, []);
    useEffect(() => {
        fetchAllDistrictsFlat().then(entries => {
            const lookup: Record<string, District> = {};
            for (const e of entries) {
                const d: District = {
                    id: e.districtId,
                    districtName: e.districtName,
                    districtNameGeo: e.districtNameGeo,
                    companyServicePrice: e.companyServicePrice,
                    isCapitalTerritory: e.isCapitalTerritory,
                    isCityTerritory: e.isCityTerritory,
                };
                lookup[e.districtName] = d;
                if (e.districtNameGeo) lookup[e.districtNameGeo] = d;
            }
            setDistrictLookup(lookup);
        }).catch(() => {});
    }, []);

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
                    pickUpCity:         profile.city,
                    pickUpDistrict:     profile.district,
                    pickUpAddress:      profile.address,
                }));
                setCustomerPricing({
                    companyServiceCapitalPrice:  profile.companyServiceCapitalPrice,
                    companyServiceCityPrice:     profile.companyServiceCityPrice,
                    companyServiceDistrictPrice: profile.companyServiceDistrictPrice,
                });
                setSenderAddress({ city: profile.city, district: profile.district, address: profile.address });
                setPrefilled(true);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [user?.role, token]);

    const handleUseOtherAddrChange = (checked: boolean) => {
        setUseOtherAddr(checked);
        if (!checked) {
            setSender(prev => ({
                ...prev,
                pickUpCity:     prev.registeredCity,
                pickUpDistrict: prev.registeredDistrict,
                pickUpAddress:  prev.registeredAddress,
            }));
        }
    };

    const handleSenderChange = useCallback((field: keyof SenderFormData, value: string) => {
        setSender(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }, []);

    const handlePackageChange = useCallback(
        (index: number, field: keyof OrderItemRequest, value: string | boolean | number) => {
            setPackages(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
            setErrors(prev => {
                const n = { ...prev };
                delete n[`orders[${index}].${field}`];
                return n;
            });
        }, [],
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
        try { await downloadExcelTemplate(lang); }
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
            const normalised = parsed.map(o => ({ ...EMPTY_PACKAGE, ...o, description: o.description ?? '' }));

            const uniqueCities = [...new Set(normalised.map(o => o.recipientCity).filter(Boolean))];
            const districtMap: Record<string, Record<string, import('../../api/cities').District>> = {};

            await Promise.all(uniqueCities.map(async cityName => {
                const city = cities.find(c => c.cityName === cityName || c.cityNameGeo === cityName);
                if (!city) return;
                const districtList = await fetchDistricts(city.id);
                setCityDistrictCache(prev => ({ ...prev, [cityName]: new Set(districtList.map(d => d.districtName)) }));
                districtMap[cityName] = {};
                for (const d of districtList) {
                    districtMap[cityName][d.districtName] = d;
                    if (d.districtNameGeo) districtMap[cityName][d.districtNameGeo] = d;
                }
            }));

            const withFees = normalised.map(o => {
                const cityDistricts = districtMap[o.recipientCity];
                if (!cityDistricts) return o;
                const district = cityDistricts[o.recipientDistrict];
                if (!district) return o;
                let fee = 0;
                const tierId = o.weightPriceTierId;
                if (tierId) {
                    const tier = weightTiers.find(wt => wt.id === tierId);
                    if (tier) {
                        const zonePrice = district.isCapitalTerritory ? tier.capitalPrice
                                        : district.isCityTerritory    ? tier.cityPrice
                                                                       : tier.districtPrice;
                        if ((zonePrice ?? 0) > 0) fee = zonePrice!;
                    }
                }
                if (fee === 0 && customerPricing) {
                    if (district.isCapitalTerritory && (customerPricing.companyServiceCapitalPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceCapitalPrice!;
                    else if (district.isCityTerritory && (customerPricing.companyServiceCityPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceCityPrice!;
                    else if ((customerPricing.companyServiceDistrictPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceDistrictPrice!;
                }
                if (fee === 0) fee = district.companyServicePrice ?? 0;
                return { ...o, companyServicePrice: fee };
            });

            setPackages(withFees);
            setImportedCount(withFees.length);
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
        setErrors({});
    };

    const scrollToTopError = () => {
        setTimeout(() => {
            const all = document.querySelectorAll('.form-field--error, .ptl-inp--err, .cdp-field--error');
            if (!all.length) return;
            let topY = all[0].getBoundingClientRect().top + window.scrollY;
            all.forEach(el => { const y = el.getBoundingClientRect().top + window.scrollY; if (y < topY) topY = y; });
            window.scrollTo({ top: Math.max(0, topY - 80), behavior: 'smooth' });
        }, 50);
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setGlobalError(null);

        const validationErrors = validate(sender, packages, cities, cityDistrictCache, t);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            scrollToTopError();
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
                    amountToCollectForPackage: p.productPaymentStatus === 'NotPaid' ? p.amountToCollectForPackage : undefined,
                    companyServicePrice: p.companyServicePrice ?? undefined,
                    weightPriceTierId: p.weightPriceTierId || undefined,
                    orderType: p.orderType,
                    returnPickupAddress:  p.orderType === 'Return' ? p.returnPickupAddress?.trim()  : undefined,
                    returnPickupCity:     p.orderType === 'Return' ? p.returnPickupCity?.trim()     : undefined,
                    returnPickupDistrict: p.orderType === 'Return' ? p.returnPickupDistrict?.trim() : undefined,
                })),
            };

            const response = await createGroupOrder(payload, token!);
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
                    scrollToTopError();
                }
                setGlobalError(err.message);
            } else {
                setGlobalError(t.cgoGlobalError);
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
                    <p className="page__eyebrow">{t.cgoEyebrow}</p>
                    <h1 className="page__title">{t.cgoTitle}</h1>
                    <p className="page__desc">{t.cgoDesc}</p>
                </div>

                <form className="order-form" onSubmit={handleSubmit} noValidate>
                    <SenderSection
                        data={sender}
                        errors={errors}
                        onChange={handleSenderChange}
                        prefilled={prefilled}
                        useOtherAddress={useOtherAddr}
                        onUseOtherAddressChange={handleUseOtherAddrChange}
                        onOpenPickupModal={() => setPickupModalOpen(true)}
                    />

                    <PickupAddressModal
                        open={pickupModalOpen}
                        initial={{ city: sender.pickUpCity, district: sender.pickUpDistrict, address: sender.pickUpAddress }}
                        onSave={addr => {
                            setSender(prev => ({ ...prev, pickUpCity: addr.city, pickUpDistrict: addr.district, pickUpAddress: addr.address }));
                            setUseOtherAddr(true);
                            setPickupModalOpen(false);
                        }}
                        onClose={() => setPickupModalOpen(false)}
                    />

                    <section className="form-section">
                        <div className="form-section__header">
                            <span className="form-section__number">{t.cgoPackagesNum}</span>
                            <div>
                                <h2 className="form-section__title">{t.cgoPackagesTitle}</h2>
                                <p className="form-section__desc">{t.cgoPackagesDesc(packages.length)}</p>
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
                                        <span className="excel-import__title">{t.cgoBulkTitle}</span>
                                        <span className="excel-import__desc">{t.cgoBulkDesc}</span>
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
                                                {t.cgoImported(importedCount)}
                                            </div>
                                            <button type="button" className="excel-import__clear" onClick={clearImport}>{t.cgoClearReset}</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="btn excel-import__btn-download" onClick={handleDownloadTemplate}>
                                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                    <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                                {t.cgoDownloadTemplate}
                                            </button>
                                            <button type="button" className="btn excel-import__btn-upload" onClick={() => fileInputRef.current?.click()} disabled={excelImporting}>
                                                {excelImporting ? (
                                                    <><span className="btn__spinner btn__spinner--dark" />{t.cgoImporting}</>
                                                ) : (
                                                    <>
                                                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                                            <path d="M7 9V1M4 4l3-3 3 3M2 11h10M2 13h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                                        </svg>
                                                        {t.cgoUploadImport}
                                                    </>
                                                )}
                                            </button>
                                        </>
                                    )}
                                    <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={handleFileChange} />
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

                            {/* ── Layout switcher ── */}
                            <div className="layout-switcher">
                                <span className="layout-switcher__label">View:</span>
                                <div className="layout-switcher__tabs">
                                    <button
                                        type="button"
                                        className={`layout-tab${layout === 'cards' ? ' layout-tab--active' : ''}`}
                                        onClick={() => setLayout('cards')}
                                        title="Accordion cards (default)"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <rect x="1" y="2" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                                            <rect x="1" y="7" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                                            <rect x="1" y="12" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                                        </svg>
                                        Cards
                                    </button>
                                    <button
                                        type="button"
                                        className={`layout-tab${layout === 'sidebar' ? ' layout-tab--active' : ''}`}
                                        onClick={() => setLayout('sidebar')}
                                        title="Sidebar navigator view"
                                    >
                                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                            <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.3"/>
                                            <path d="M5 1v14" stroke="currentColor" strokeWidth="1.3"/>
                                        </svg>
                                        Sidebar
                                    </button>
                                </div>
                            </div>

                            {/* ── Package editors ── */}
                            {layout === 'cards' && (
                                <>
                                    <div className="package-list">
                                        {packages.map((pkg, i) => (
                                            <PackageCard
                                                key={i}
                                                index={i}
                                                data={pkg}
                                                errors={errors}
                                                canRemove={packages.length > 1}
                                                customerPricing={customerPricing}
                                                weightTiers={weightTiers}
                                                senderAddress={senderAddress}
                                                districtLookup={districtLookup}
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
                                            {t.cgoAddPackage}
                                        </button>
                                    )}
                                </>
                            )}

                            {layout === 'sidebar' && (
                                <PackageSidebarLayout
                                    packages={packages}
                                    errors={errors}
                                    customerPricing={customerPricing}
                                    weightTiers={weightTiers}
                                    senderAddress={senderAddress}
                                    districtLookup={districtLookup}
                                    onChange={handlePackageChange}
                                    onRemove={removePackage}
                                    onAdd={addPackage}
                                />
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
                            <span className="form-footer__count">{t.cgoFooterCount(packages.length)}</span>
                            <span className="form-footer__hint">{t.cgoFooterHint}</span>
                        </div>
                        <button type="submit" className="btn btn--primary" disabled={submitting}>
                            {submitting ? (
                                <><span className="btn__spinner" />{t.cgoSubmitting}</>
                            ) : (
                                <>
                                    {t.cgoSubmit}
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
