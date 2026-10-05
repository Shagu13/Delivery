import { useState, useCallback, useRef, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { createGroupOrder, addOrdersToBatch, downloadExcelTemplate, parseGroupOrderExcel, ApiError } from '../../api/groupOrders';
import { getMyProfile, getMyOrders } from '../../api/customers';
import type { Customer, CustomerGroupOrder, CustomerSecondaryAddress } from '../../api/customers';
import { useCart } from '../../contexts/useCart';
import { fetchCities, fetchDistricts, fetchAllDistrictsFlat } from '../../api/cities';
import type { City, District } from '../../api/cities';
import { fetchWeightPriceTiers } from '../../api/weightPriceTiers';
import type { WeightPriceTier } from '../../api/weightPriceTiers';
import type {
    CreateGroupOrderResponse,
    OrderItemRequest,
    ValidationErrors,
} from '../../types/groupOrder';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import type { Translations } from '../../contexts/translations';
import { isValidGeorgianMobile, sanitizeGeorgianMobile } from '../../components/ui/GeorgianPhoneField';
import { SenderSection } from './SenderSection';
import { PackageSidebarLayout } from './PackageSidebarLayout';
import { SuccessView } from './SuccessView';
import { PickupAddressModal } from './PickupAddressModal';
import './createGroupOrder.css';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SenderFormData {
    senderFirstName:    string;
    senderLastName:     string;
    senderIdNumber?:    string;
    senderBusinessName: string;
    senderPhone:        string;
    alternativeSenderPhone: string;
    registeredCity:     string;
    registeredDistrict: string;
    registeredAddress:  string;
    pickUpCity:         string;
    pickUpDistrict:     string;
    pickUpAddress:      string;
    note:               string;
}

// Synthetic id for the customer's registered (main) address in the saved-address picker —
// never collides with a real CustomerSecondaryAddress guid.
const MAIN_ADDRESS_ID = 'main';

const EMPTY_SENDER: SenderFormData = {
    senderFirstName:    '',
    senderLastName:     '',
    senderIdNumber:     '',
    senderBusinessName: '',
    senderPhone:        '',
    alternativeSenderPhone: '',
    registeredCity:     '',
    registeredDistrict: '',
    registeredAddress:  '',
    pickUpCity:         '',
    pickUpDistrict:     '',
    pickUpAddress:      '',
    note:               '',
};

const EMPTY_PACKAGE: OrderItemRequest = {
    recipientName:                '',
    recipientPhone:               '',
    recipientCity:                '',
    recipientDistrict:            '',
    recipientAddress:             '',
    description:                  '',
    isFragile:                    false,
    productPaymentStatus:         'Paid',
    whoPaysForCompanyService:     'Recipient',
    orderType:                    'Send',
    returnPickupAddress:          undefined,
    returnPickupCity:             undefined,
    returnPickupDistrict:         undefined,
    amountToCollectForPackage:    undefined,
    weightPriceTierId:            undefined,
    latitude:                     undefined,
    longitude:                    undefined,
};

// ── Validation ────────────────────────────────────────────────────────────────

function validate(
    sender: SenderFormData,
    packages: OrderItemRequest[],
    cities: City[],
    cityDistrictCache: Record<string, Set<string>>,
    t: Translations,
    serviceIncludedForced: boolean,
    appendMode: boolean,
): ValidationErrors {
    const errors: ValidationErrors = {};

    const req = (key: string, val: string, errMsg: string) => {
        if (!val.trim()) errors[key] = errMsg;
    };

    // In append mode the sender + pickup come from the existing batch, so only the
    // package fields are validated here.
    if (!appendMode) {
        req('senderFirstName',    sender.senderFirstName,    t.cgoErrFirstName);
        req('senderLastName',     sender.senderLastName,     t.cgoErrLastName);
        req('senderBusinessName', sender.senderBusinessName, t.cgoErrBusinessName);
        req('senderPhone',        sender.senderPhone,        t.cgoErrPhone);
        req('pickUpCity',         sender.pickUpCity,         t.cgoErrCity);
        req('pickUpDistrict',     sender.pickUpDistrict,     t.cgoErrDistrict);
        req('pickUpAddress',      sender.pickUpAddress,      t.cgoErrAddress);

        if (sender.note.length > 500) errors.note = t.cgoErrNoteMax;
    }

    packages.forEach((pkg, i) => {
        const p = (field: string, val: string, errMsg: string) => {
            if (!val.trim()) errors[`orders[${i}].${field}`] = errMsg;
        };
        // Recipient name is optional — blank stores "" and renders as "Unknown"/"უცნობი".
        if (!pkg.recipientPhone.trim()) {
            errors[`orders[${i}].recipientPhone`] = t.cgoErrPhone;
        } else if (!isValidGeorgianMobile(pkg.recipientPhone)) {
            errors[`orders[${i}].recipientPhone`] = t.cgoErrInvalidPhone;
        }
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
            } else if (
                (serviceIncludedForced || pkg.isCompanyServicePriceIncluded) &&
                pkg.companyServicePrice != null &&
                pkg.amountToCollectForPackage < pkg.companyServicePrice
            ) {
                // All-in price must cover the service fee that will be deducted.
                errors[`orders[${i}].amountToCollectForPackage`] = t.cgoErrPriceBelowFee;
            }
        }

        // The courier service fee is optional at creation: when no district /
        // customer / weight-tier price is configured it's left unset (null) and
        // an admin fills it in later. A resolved price is still saved.

        if (pkg.orderType === 'Return') {
            if (!pkg.returnPickupCity?.trim())
                errors[`orders[${i}].returnPickupCity`] = t.cgoErrReturnPickupCity;
            if (!pkg.returnPickupDistrict?.trim())
                errors[`orders[${i}].returnPickupDistrict`] = t.cgoErrReturnPickupDistrict;
            if (!pkg.returnPickupAddress?.trim())
                errors[`orders[${i}].returnPickupAddress`] = t.cgoErrReturnPickupAddress;
        }
    });

    return errors;
}

// ── Component ─────────────────────────────────────────────────────────────────

/** A package in the form. `cartId` is set once it has been saved to the cart (and kept visible). */
type FormPackage = OrderItemRequest & { cartId?: string };

export function CreateGroupOrderPage() {
    const { user, token } = useAuth();
    const { t, lang } = useLanguage();
    const navigate = useNavigate();
    const { saveItems, removeItem } = useCart();

    // ── Append mode ────────────────────────────────────────────────────────────
    // /send?batch=<id> adds packages to an existing open batch instead of creating a
    // new one. The sender + pickup are taken from the batch (read-only banner).
    const [searchParams] = useSearchParams();
    const batchId   = searchParams.get('batch');
    const appendMode = !!batchId;
    const [appendBatch, setAppendBatch] = useState<CustomerGroupOrder | null>(null);
    const [appendError, setAppendError] = useState<string | null>(null);

    const [sender,       setSender]       = useState<SenderFormData>(EMPTY_SENDER);
    const [useOtherAddr, setUseOtherAddr] = useState(false);
    const [packages,     setPackages]     = useState<FormPackage[]>([{ ...EMPTY_PACKAGE }]);
    const [errors,       setErrors]       = useState<ValidationErrors>({});
    const [submitting,   setSubmitting]   = useState(false);
    // Brief "added to cart" confirmation shown after stashing packages (stays on page).
    const [justAdded,    setJustAdded]    = useState<number | null>(null);
    const addedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (addedTimerRef.current) clearTimeout(addedTimerRef.current); }, []);
    const [globalError,  setGlobalError]  = useState<string | null>(null);
    const [result,       setResult]       = useState<CreateGroupOrderResponse | null>(null);
    const [customerPricing, setCustomerPricing] = useState<Pick<Customer, 'companyServiceCapitalPrice' | 'companyServiceCityPrice' | 'companyServiceDistrictPrice' | 'specialPrices'> | null>(null);
    const [serviceIncludedForced, setServiceIncludedForced] = useState(false);
    const [senderAddress, setSenderAddress] = useState<{ city: string; district: string; address: string } | null>(null);

    const [excelImporting, setExcelImporting] = useState(false);
    const [excelError,     setExcelError]     = useState<string | null>(null);
    const [importedCount,  setImportedCount]  = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prefilled,       setPrefilled]       = useState(false);
    const [pickupModalOpen, setPickupModalOpen] = useState(false);

    // ── Saved pickup addresses (main + up to 5 secondary) ──────────────────────
    const [secondaryAddresses, setSecondaryAddresses] = useState<CustomerSecondaryAddress[]>([]);
    const [selectedAddressId,  setSelectedAddressId]  = useState(MAIN_ADDRESS_ID);
    const addressOptions = [
        { id: MAIN_ADDRESS_ID, label: t.cgoAddrMainOption, city: sender.registeredCity, district: sender.registeredDistrict, address: sender.registeredAddress },
        ...secondaryAddresses.map(a => ({ id: a.id, label: a.label, city: a.city, district: a.district, address: a.address })),
    ];
    const handleSelectAddress = (id: string) => {
        const opt = addressOptions.find(o => o.id === id);
        if (!opt) return;
        setSelectedAddressId(id);
        setUseOtherAddr(false);
        setSender(prev => ({ ...prev, pickUpCity: opt.city, pickUpDistrict: opt.district, pickUpAddress: opt.address }));
        setErrors(prev => {
            const n = { ...prev };
            delete n.pickUpCity; delete n.pickUpDistrict; delete n.pickUpAddress;
            return n;
        });
    };

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
                    alternativeSenderPhone: '',
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
                    specialPrices:               profile.specialPrices,
                });
                setServiceIncludedForced(profile.isCompanyServicePriceIncludedInPrice);
                setSenderAddress({ city: profile.city, district: profile.district, address: profile.address });
                setSecondaryAddresses(profile.secondaryAddresses ?? []);
                setSelectedAddressId(MAIN_ADDRESS_ID);
                setPrefilled(true);
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [user?.role, token]);

    // ── Load the target batch in append mode ───────────────────────────────────
    useEffect(() => {
        if (!batchId || !token) return;
        let cancelled = false;
        (async () => {
            try {
                const all = await getMyOrders(token);
                if (cancelled) return;
                const found = all.find(g => g.id === batchId) ?? null;
                // Deliberately no status check: the backend find-or-create resolves a
                // picked-up batch to whichever batch is still open today, or starts a new
                // one, so a closed batch is never a reason to block the customer here.
                // Return-only cards are standalone orders with no real batch to append to.
                // A Return card is a standalone order surfaced as a pseudo-batch, so its id
                // is an Order id and matches here even though no such GroupOrder exists.
                const isReturnOnly = !!found
                    && found.orders.length > 0
                    && found.orders.every(o => o.orderType === 'Return');
                if (!found || isReturnOnly) { setAppendError(t.cgoAppendUnavailable); return; }
                setAppendError(null);
                setAppendBatch(found);
            } catch {
                // Transient — the batch itself may be perfectly fine.
                if (!cancelled) setAppendError(t.cgoAppendLoadFailed);
            }
        })();
        return () => { cancelled = true; };
    }, [batchId, token, t]);

    const handleUseOtherAddrChange = (checked: boolean) => {
        setUseOtherAddr(checked);
        if (!checked) {
            setSender(prev => ({
                ...prev,
                pickUpCity:     prev.registeredCity,
                pickUpDistrict: prev.registeredDistrict,
                pickUpAddress:  prev.registeredAddress,
            }));
            setSelectedAddressId(MAIN_ADDRESS_ID);
        }
    };

    const handleSenderChange = useCallback((field: keyof SenderFormData, value: string) => {
        setSender(prev => ({ ...prev, [field]: value }));
        setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    }, []);

    const handlePackageChange = useCallback(
        (index: number, field: keyof OrderItemRequest, value: string | boolean | number | null) => {
            setPackages(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
            setErrors(prev => {
                const n = { ...prev };
                delete n[`orders[${index}].${field}`];
                return n;
            });
        }, [],
    );

    // Form package → order payload (strips the form-only `cartId`, normalises payment fields).
    const toPayload = (p: FormPackage): OrderItemRequest => {
        const rest: FormPackage = { ...p };
        delete rest.cartId;
        return {
            ...rest,
            description: p.description?.trim() || undefined,
            // Unpaid (COD) parcels: the recipient always pays the courier
            // fee, so the chooser is hidden — pin the value to Recipient.
            whoPaysForCompanyService: p.productPaymentStatus === 'NotPaid' ? 'Recipient' : p.whoPaysForCompanyService,
            amountToCollectForPackage: p.productPaymentStatus === 'NotPaid' ? p.amountToCollectForPackage : undefined,
            companyServicePrice: p.companyServicePrice ?? undefined,
            isCompanyServicePriceIncluded: serviceIncludedForced || !!p.isCompanyServicePriceIncluded,
            weightPriceTierId: p.weightPriceTierId || undefined,
            orderType: p.orderType,
            returnPickupAddress:  p.orderType === 'Return' ? p.returnPickupAddress?.trim()  : undefined,
            returnPickupCity:     p.orderType === 'Return' ? p.returnPickupCity?.trim()     : undefined,
            returnPickupDistrict: p.orderType === 'Return' ? p.returnPickupDistrict?.trim() : undefined,
        };
    };

    const senderSnapshot = () => ({
        senderFirstName:        sender.senderFirstName,
        senderLastName:         sender.senderLastName,
        senderIdNumber:         sender.senderIdNumber?.trim() || undefined,
        senderBusinessName:     sender.senderBusinessName,
        senderPhone:            sender.senderPhone,
        alternativeSenderPhone: sender.alternativeSenderPhone.trim() || undefined,
        pickUpCity:             sender.pickUpCity,
        pickUpDistrict:         sender.pickUpDistrict,
        pickUpAddress:          sender.pickUpAddress,
        note:                   sender.note.trim() || undefined,
    });

    // Stashes the packages at `indexes` in the cart: ones already there are overwritten with the
    // current form values, new ones are added and remembered by `cartId` so they stay visible but
    // are never added twice. Returns how many were newly added.
    const saveToCart = (indexes: number[]): number => {
        const adds: number[] = [];
        const updates: Record<string, OrderItemRequest> = {};
        indexes.forEach(i => {
            const id = packages[i].cartId;
            if (id) updates[id] = toPayload(packages[i]);
            else adds.push(i);
        });
        const ids = saveItems(adds.map(i => toPayload(packages[i])), updates, senderSnapshot());
        if (adds.length > 0) {
            const idByIndex = new Map(adds.map((pkgIndex, n) => [pkgIndex, ids[n]]));
            setPackages(prev => prev.map((p, i) => (idByIndex.has(i) ? { ...p, cartId: idByIndex.get(i) } : p)));
        }
        return adds.length;
    };

    const flashAdded = (count: number) => {
        setJustAdded(count);
        if (addedTimerRef.current) clearTimeout(addedTimerRef.current);
        addedTimerRef.current = setTimeout(() => setJustAdded(null), 4000);
    };

    // "Add Package" also auto-saves the packages filled in so far, so a refresh can't lose them.
    // Only valid ones are stashed; invalid ones stay in the form with their errors. Append mode
    // submits straight to a batch (no cart), so it just opens another editor.
    const addPackage = () => {
        if (packages.length >= 300) return;
        if (!appendMode) {
            const validationErrors = validate(sender, packages, cities, cityDistrictCache, t, serviceIncludedForced, false);
            setErrors(validationErrors);
            const senderOk = Object.keys(validationErrors).every(k => k.startsWith('orders['));
            const valid = senderOk
                ? packages.map((_, i) => i).filter(i => !Object.keys(validationErrors).some(k => k.startsWith(`orders[${i}].`)))
                : [];
            if (valid.length > 0) {
                const added = saveToCart(valid);
                if (added > 0) flashAdded(added);
            }
        }
        setPackages(prev => [...prev, { ...EMPTY_PACKAGE }]);
    };

    const removePackage = useCallback((index: number) => {
        const cartId = packages[index]?.cartId;
        if (cartId) removeItem(cartId);
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
    }, [packages, removeItem]);

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
            const normalised = parsed.map(o => ({
                ...EMPTY_PACKAGE,
                ...o,
                recipientPhone: sanitizeGeorgianMobile(o.recipientPhone ?? ''),
                description: o.description ?? '',
            }));

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

            // Swapped pricing: when the batch pickup isn't the capital (Tbilisi) and the
            // package is delivered TO the capital, imported Send/Exchange packages take their
            // *default* price off the pickup district instead of the recipient. Non-capital →
            // non-capital prices normally, off the recipient district. The customer's
            // negotiated rates are unaffected by the swap — they always follow the delivery
            // (recipient) district's zone.
            const pickupDistrictName = appendMode ? appendBatch?.pickUpDistrict : sender.pickUpDistrict;
            const pickupDistrict = pickupDistrictName ? districtLookup[pickupDistrictName] ?? null : null;
            const pickupCanSwap = !!pickupDistrict && !pickupDistrict.isCapitalTerritory;

            const withFees = normalised.map(o => {
                const customerZone = districtMap[o.recipientCity]?.[o.recipientDistrict] ?? null;
                const district = pickupCanSwap && customerZone?.isCapitalTerritory ? pickupDistrict : customerZone;
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
                    const special = customerZone && customerPricing.specialPrices?.find(s => s.districtId === customerZone.id);
                    if (special) fee = special.price;
                    else if (customerZone?.isCapitalTerritory && (customerPricing.companyServiceCapitalPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceCapitalPrice!;
                    else if (customerZone?.isCityTerritory && (customerPricing.companyServiceCityPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceCityPrice!;
                    else if ((customerPricing.companyServiceDistrictPrice ?? 0) > 0)
                        fee = customerPricing.companyServiceDistrictPrice!;
                }
                if (fee === 0) fee = district.companyServicePrice ?? 0;
                // Leave the fee unset (undefined) when nothing resolved, so the
                // field reads as empty — matching the manual form. Admin fills later.
                return { ...o, companyServicePrice: fee > 0 ? fee : undefined };
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

        const validationErrors = validate(sender, packages, cities, cityDistrictCache, t, serviceIncludedForced, appendMode);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            scrollToTopError();
            return;
        }

        const ordersPayload: OrderItemRequest[] = packages.map(toPayload);

        // ── New orders → cart ─────────────────────────────────────────────────
        // Brand-new orders are stashed in the cart. The customer stays on the page so
        // they can add more packages; they place everything later from the cart. Packages
        // already auto-saved by "Add Package" are updated in place, not added again.
        if (!appendMode) {
            saveToCart(packages.map((_, i) => i));
            // Reset just the package editors (keep sender/pickup) for the next package.
            setPackages([{ ...EMPTY_PACKAGE }]);
            setErrors({});
            setGlobalError(null);
            setImportedCount(null);
            flashAdded(ordersPayload.length);
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }

        // ── Append mode → straight into the existing open batch ───────────────
        // Returns are standalone orders and can never join a batch (the backend
        // validator rejects the whole request if one is mixed in), so they're
        // split out and created through the normal create endpoint instead —
        // which already knows how to carve standalone Returns out of a mixed
        // submission (see CreateGroupOrderCommandHandler). Send/Exchange
        // packages still go through the batch-append endpoint pinned to this
        // exact batch.
        const indexed     = ordersPayload.map((p, i) => ({ p, i }));
        const returnItems = indexed.filter(x => x.p.orderType === 'Return');
        const batchItems  = indexed.filter(x => x.p.orderType !== 'Return');

        setSubmitting(true);
        let failedItems = indexed;
        try {
            const responses: CreateGroupOrderResponse[] = [];

            if (batchItems.length > 0) {
                failedItems = batchItems;
                responses.push(await addOrdersToBatch(batchId!, batchItems.map(x => x.p), token!));
            }
            if (returnItems.length > 0) {
                failedItems = returnItems;
                responses.push(await createGroupOrder({
                    senderFirstName:    sender.senderFirstName,
                    senderLastName:     sender.senderLastName,
                    senderIdNumber:     sender.senderIdNumber?.trim() || undefined,
                    senderBusinessName: appendBatch?.senderBusinessName ?? sender.senderBusinessName,
                    senderPhone:        appendBatch?.senderPhone || sender.senderPhone,
                    alternativeSenderPhone: appendBatch?.alternativeSenderPhone || undefined,
                    pickUpCity:         appendBatch!.pickUpCity,
                    pickUpDistrict:     appendBatch!.pickUpDistrict,
                    pickUpAddress:      appendBatch!.pickUpAddress ?? '',
                    orders:             returnItems.map(x => x.p),
                }, token!));
            }

            setResult({
                groupOrderId:       batchId!,
                senderBusinessName: appendBatch?.senderBusinessName ?? '',
                orders:             responses.flatMap(r => r.orders),
            });
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.errors) {
                    // Error keys are indexed into whichever sub-array was in flight
                    // when the request failed — remap back to the original package
                    // index so the right editor lights up.
                    const mapped: ValidationErrors = {};
                    Object.entries(err.errors).forEach(([key, messages]) => {
                        const m = key.match(/orders\[(\d+)\](.*)/i);
                        const remapped = m && failedItems[Number(m[1])]
                            ? `orders[${failedItems[Number(m[1])].i}]${m[2]}`
                            : key;
                        mapped[remapped.toLowerCase()] = (messages as string[])[0];
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
                    alternativeSenderPhone: '',
                    registeredCity:     profile.city,
                    registeredDistrict: profile.district,
                    registeredAddress:  profile.address,
                    pickUpCity:         profile.city,
                    pickUpDistrict:     profile.district,
                    pickUpAddress:      profile.address,
                    note:               '',
                });
                setSecondaryAddresses(profile.secondaryAddresses ?? []);
            }).catch(() => setSender(EMPTY_SENDER));
        } else {
            setSender(EMPTY_SENDER);
        }
        setSelectedAddressId(MAIN_ADDRESS_ID);
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
                    <SuccessView
                        result={result}
                        onNewOrder={appendMode ? () => navigate('/customer?view=shipments') : handleNewOrder}
                        title={appendMode ? t.cgoAppendSuccessTitle : undefined}
                        subtitle={appendMode ? t.cgoAppendSuccessSubtitle : undefined}
                        newOrderLabel={appendMode ? t.custNavShipments : undefined}
                    />
                </main>
            </div>
        );
    }

    // Append target couldn't be used: unknown/foreign batch id, a Return card, or the
    // lookup failed. A picked-up batch is NOT one of these — the backend redirects those
    // to whichever batch is still open, or starts a new one.
    if (appendMode && appendError) {
        return (
            <div className="page">
                <main className="page__main">
                    <div className="global-error" role="alert" style={{ maxWidth: 520, margin: '40px auto 16px' }}>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        {appendError}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <button type="button" className="btn" onClick={() => navigate('/customer?view=shipments')}>
                            {t.custNavShipments}
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    // Group the current validation errors into a summary the customer can read
    // at a glance — sender problems, and for multi-order submissions each
    // order's missing fields listed under "Order N". The messages are already
    // localised (stored in the errors map), so this works in both languages.
    const senderErrorMsgs: string[] = [];
    const orderErrorMsgs = new Map<number, string[]>();
    Object.entries(errors).forEach(([key, msg]) => {
        if (!msg) return;
        const m = key.match(/^orders\[(\d+)\]\./);
        if (m) {
            const idx  = Number(m[1]);
            const list = orderErrorMsgs.get(idx) ?? [];
            if (!list.includes(msg)) list.push(msg);
            orderErrorMsgs.set(idx, list);
        } else if (!senderErrorMsgs.includes(msg)) {
            senderErrorMsgs.push(msg);
        }
    });
    const hasValidationSummary = senderErrorMsgs.length > 0 || orderErrorMsgs.size > 0;

    return (
        <div className="page">
            {justAdded !== null && (
                <div role="status" style={{
                    // Clears the sticky submit bar that the phone layout pins to the bottom.
                    position: 'fixed', bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))',
                    left: '50%', transform: 'translateX(-50%)', zIndex: 200, maxWidth: 'calc(100vw - 32px)',
                    display: 'flex', alignItems: 'center', gap: 12, background: 'var(--color-text)', color: 'var(--color-bg)',
                    borderRadius: 'var(--radius-md)', padding: '12px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                    fontSize: '0.875rem', fontWeight: 600,
                }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {t.cartAddedToast(justAdded)}
                    <Link to="/cart" style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'underline' }}>
                        {t.cartGoToCart}
                    </Link>
                </div>
            )}
            <main className="page__main">
                <div className="page__intro">
                    <p className="page__eyebrow">{t.cgoEyebrow}</p>
                </div>

                <form className="order-form" onSubmit={handleSubmit} noValidate>
                    {hasValidationSummary && (
                        <div className="global-error global-error--summary" role="alert">
                            <div className="global-error__title">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                    <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                </svg>
                                {t.cgoFixErrorsTitle}
                            </div>
                            <ul className="global-error__list">
                                {senderErrorMsgs.length > 0 && (
                                    <li>
                                        <strong>{t.cgoSenderLabel}:</strong> {senderErrorMsgs.join(' ')}
                                    </li>
                                )}
                                {[...orderErrorMsgs.entries()].sort((a, b) => a[0] - b[0]).map(([idx, msgs]) => (
                                    <li key={idx}>
                                        <strong>{t.cgoOrderLabel(idx + 1)}:</strong> {msgs.join(' ')}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {appendMode ? (
                        <section className="form-section">
                            <div className="form-section__body">
                                <div className="global-error global-error--summary" role="status" style={{ background: 'var(--color-bg-2)', color: 'var(--color-text)' }}>
                                    <div className="global-error__title" style={{ color: 'var(--color-accent)' }}>
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                                            <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        {appendBatch ? t.cgoAppendBanner(appendBatch.senderBusinessName) : '…'}
                                    </div>
                                    {appendBatch && (
                                        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-subtle)', marginTop: 4 }}>
                                            {(lang === 'ka' ? appendBatch.pickUpCityGeo : undefined) || appendBatch.pickUpCity}
                                            {', '}
                                            {(lang === 'ka' ? appendBatch.pickUpDistrictGeo : undefined) || appendBatch.pickUpDistrict}
                                            {appendBatch.pickUpAddress ? `, ${appendBatch.pickUpAddress}` : ''}
                                            {' · '}{t.cgoFooterCount(appendBatch.numberOfPackages)}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </section>
                    ) : (
                        <>
                            <SenderSection
                                data={sender}
                                errors={errors}
                                onChange={handleSenderChange}
                                prefilled={prefilled}
                                useOtherAddress={useOtherAddr}
                                onUseOtherAddressChange={handleUseOtherAddrChange}
                                onOpenPickupModal={() => setPickupModalOpen(true)}
                                addressOptions={addressOptions}
                                selectedAddressId={selectedAddressId}
                                onSelectAddress={handleSelectAddress}
                            />

                            <PickupAddressModal
                                open={pickupModalOpen}
                                initial={{ city: sender.pickUpCity, district: sender.pickUpDistrict, address: sender.pickUpAddress }}
                                onSave={addr => {
                                    setSender(prev => ({ ...prev, pickUpCity: addr.city, pickUpDistrict: addr.district, pickUpAddress: addr.address }));
                                    setUseOtherAddr(true);
                                    // No saved option matches a hand-typed one-off address anymore.
                                    setSelectedAddressId('');
                                    setPickupModalOpen(false);
                                }}
                                onClose={() => setPickupModalOpen(false)}
                            />
                        </>
                    )}

                    <section className="form-section">
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

                            {/* ── Package editors ── */}
                            <PackageSidebarLayout
                                packages={packages}
                                errors={errors}
                                customerPricing={customerPricing}
                                weightTiers={weightTiers}
                                senderAddress={senderAddress}
                                pickupDistrictName={appendMode ? appendBatch?.pickUpDistrict : sender.pickUpDistrict}
                                districtLookup={districtLookup}
                                serviceIncludedForced={serviceIncludedForced}
                                onChange={handlePackageChange}
                                onRemove={removePackage}
                            />
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
                        {packages.length < 300 && (
                            <div className="form-footer__summary">
                                <button type="button" className={`btn btn--add-package${appendMode ? ' btn--add-package--append' : ''}`} onClick={addPackage}>
                                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                    <span className="btn--add-package__label">{t.cgoAddPackage}</span>
                                </button>
                                <span className="form-footer__hint">{t.cgoAddPackageHint}</span>
                            </div>
                        )}
                        <button type="submit" className={`btn btn--primary${appendMode ? '' : ' btn--cart'}`} disabled={submitting || (appendMode && !appendBatch)}>
                            {submitting ? (
                                <><span className="btn__spinner" />{appendMode ? t.cgoAppendSubmitting : t.cgoSubmitting}</>
                            ) : appendMode ? (
                                <>
                                    {t.cgoAppendSubmit}
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </>
                            ) : (
                                <>
                                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
                                        <circle cx="7" cy="15.5" r="1" fill="currentColor" />
                                        <circle cx="14" cy="15.5" r="1" fill="currentColor" />
                                        <path d="M1 1.5h2.2l1.9 9.4a1.4 1.4 0 0 0 1.4 1.1h6.8a1.4 1.4 0 0 0 1.4-1.1L16.5 4.5H4.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    {t.cgoAddToCart}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
