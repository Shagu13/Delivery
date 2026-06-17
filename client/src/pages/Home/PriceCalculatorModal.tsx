import { useState, useEffect, useRef, useMemo } from 'react';
import { type AllDistrictEntry } from '../../api/cities';
import { type WeightPriceTier } from '../../api/weightPriceTiers';
import { useLanguage } from '../../contexts/useLanguage';
import { useAuth } from '../../contexts/useAuth';
import { prefetchCalcData, isCacheValid, _cachedDistricts, _cachedTiers } from './calcDataCache';

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:          '#ffffff',
  bg2:         '#f5f3ef',
  bg3:         '#f0ede8',
  border:      '#e2ddd7',
  borderFocus: '#c47f17',
  text:        '#1a1714',
  textMuted:   '#6b6560',
  textSubtle:  '#a8a19a',
  accent:      '#c47f17',
  accentDim:   'rgba(196,127,23,0.08)',
  accentBorder:'rgba(196,127,23,0.35)',
  error:       '#c0392b',
  radius:      { sm: 6, md: 10, lg: 16 },
};

// ── SearchInput (module-level to avoid remount on re-render) ──────────────────
interface SearchInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onClear: () => void;
  placeholder: string;
  isOpen: boolean;
}

function SearchInput({ inputRef, value, onChange, onFocus, onClear, placeholder, isOpen }: SearchInputProps) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{
          display: 'block', width: '100%', boxSizing: 'border-box',
          height: 44, padding: `0 ${value ? 38 : 14}px 0 14px`,
          border: `1.5px solid ${isOpen ? C.borderFocus : C.border}`,
          borderRadius: C.radius.md,
          fontSize: '0.92rem', fontFamily: "'Plus Jakarta Sans', sans-serif",
          background: C.bg2, color: C.text, outline: 'none',
          boxShadow: isOpen ? '0 0 0 3px rgba(196,127,23,0.15)' : 'none',
          transition: 'border-color 150ms, box-shadow 150ms',
        }}
      />
      {value && (
        <button
          type="button"
          onMouseDown={e => { e.preventDefault(); onClear(); }}
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.textSubtle, padding: 4, display: 'flex', alignItems: 'center',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Search helpers ────────────────────────────────────────────────────────────

/** Normalize: lowercase, remove Georgian-specific chars quirks, trim */
const norm = (s: string) => s.toLowerCase().trim();

/** Returns true if the entry matches the query in ANY language */
function entryMatchesQuery(d: AllDistrictEntry, q: string): boolean {
  if (!q) return true;
  const n = norm(q);
  return (
    norm(d.cityName).includes(n) ||
    norm(d.districtName).includes(n) ||
    norm(d.cityNameGeo ?? '').includes(n) ||
    norm(d.districtNameGeo ?? '').includes(n)
  );
}

/** City entry matches query */
function cityMatchesQuery(c: CityEntry, q: string): boolean {
  if (!q) return true;
  const n = norm(q);
  return norm(c.name).includes(n) || norm(c.nameGeo).includes(n);
}

/** True when a district's name is the same as its city name (e.g. Zugdidi › Zugdidi) */
function isEponymous(d: AllDistrictEntry): boolean {
  return (
    norm(d.districtName) === norm(d.cityName) ||
    (!!d.districtNameGeo && !!d.cityNameGeo && norm(d.districtNameGeo) === norm(d.cityNameGeo))
  );
}

// ── API ───────────────────────────────────────────────────────────────────────
interface PriceResult {
  price: number;
  tier: 'capital' | 'city' | 'district' | 'default';
}

async function fetchBasePrice(districtId: string, weightTierId?: string | null, token?: string | null): Promise<PriceResult> {
  const params = new URLSearchParams({ districtId });
  if (weightTierId) params.set('weightTierId', weightTierId);
  const res = await fetch(`/api/calculator?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CityEntry { id: string; name: string; nameGeo: string; }

// ── Shared styles ─────────────────────────────────────────────────────────────
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '0.71rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: '#a8a19a', marginBottom: 6,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};
const DROPDOWN: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
  background: '#ffffff', border: '1px solid #e2ddd7', borderRadius: 10,
  boxShadow: '0 8px 28px rgba(0,0,0,0.14)',
  zIndex: 10000, maxHeight: 220, overflowY: 'auto',
};
const OPTION: React.CSSProperties = {
  padding: '9px 14px', cursor: 'pointer',
  borderBottom: '1px solid #f0ede8',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
};
const EMPTY: React.CSSProperties = {
  padding: '12px 14px', fontSize: '0.85rem',
  color: '#a8a19a', fontFamily: "'Plus Jakarta Sans', sans-serif",
};

function Tick() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
      <path d="M2 6.5l3.5 3.5L11 3" stroke="#c47f17" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ── CalcCore — the actual calculator UI ───────────────────────────────────────

export interface CalcCoreProps {
  token?: string | null;
  /** When true, uses slightly more compact padding */
  compact?: boolean;
}

export function CalcCore({ token, compact }: CalcCoreProps) {
  const { t, lang } = useLanguage();

  const [allDistricts,     setAllDistricts]     = useState<AllDistrictEntry[]>(() => _cachedDistricts ?? []);
  const [weightTiers,      setWeightTiers]       = useState<WeightPriceTier[]>(() => _cachedTiers ?? []);
  const [loadingData,      setLoadingData]       = useState(() => !isCacheValid());

  // From city
  const [fromSearch,    setFromSearch]    = useState('');
  const [fromOpen,      setFromOpen]      = useState(false);
  const [selectedCity,  setSelectedCity]  = useState('');
  const [fromHoverId,   setFromHoverId]   = useState<string | null>(null);

  // To district
  const [toSearch,      setToSearch]      = useState('');
  const [toOpen,        setToOpen]        = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<AllDistrictEntry | null>(null);
  const [toHoverId,     setToHoverId]     = useState<string | null>(null);

  // Weight tier
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  // Price
  const [basePrice,     setBasePrice]     = useState<PriceResult | null>(null);
  const [loadingPrice,  setLoadingPrice]  = useState(false);
  const [priceError,    setPriceError]    = useState(false);

  const fromWrapRef  = useRef<HTMLDivElement>(null);
  const toWrapRef    = useRef<HTMLDivElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef   = useRef<HTMLInputElement>(null);

  // ── Load data (uses module-level cache, TTL: 5 min) ────────────────────────
  useEffect(() => {
    if (isCacheValid()) return;
    prefetchCalcData().then(() => {
      if (_cachedDistricts) setAllDistricts(_cachedDistricts);
      if (_cachedTiers)     setWeightTiers(_cachedTiers);
      setLoadingData(false);
    });
  }, []);

  // ── Close on outside click ──────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (fromWrapRef.current && !fromWrapRef.current.contains(e.target as Node)) {
        setFromOpen(false);
        if (!selectedCity) setFromSearch('');
      }
      if (toWrapRef.current && !toWrapRef.current.contains(e.target as Node)) {
        setToOpen(false);
        if (!selectedEntry) setToSearch('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [selectedCity, selectedEntry]);

  // ── Fetch base price when destination or weight tier changes ───────────────
  useEffect(() => {
    if (!selectedEntry) return;
    let cancelled = false;
    const run = async () => {
      setLoadingPrice(true);
      setPriceError(false);
      try {
        const result = await fetchBasePrice(selectedEntry.districtId, selectedTierId, token);
        if (!cancelled) setBasePrice(result);
      } catch {
        if (!cancelled) setPriceError(true);
      } finally {
        if (!cancelled) setLoadingPrice(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [selectedEntry, selectedTierId, token]);

  // ── Derived: unique cities ──────────────────────────────────────────────────
  const allCities = useMemo<CityEntry[]>(() => {
    const seen = new Map<string, string>();
    allDistricts.forEach(d => {
      if (!seen.has(d.cityName)) seen.set(d.cityName, d.cityNameGeo ?? d.cityName);
    });
    return Array.from(seen.entries()).map(([name, nameGeo]) => ({ id: name, name, nameGeo }));
  }, [allDistricts]);

  const filteredCities = useMemo(() => {
    if (!fromSearch) return allCities;
    return allCities.filter(c => cityMatchesQuery(c, fromSearch));
  }, [allCities, fromSearch]);

  // ── Derived: filtered + sorted districts ───────────────────────────────────
  const filteredDistricts = useMemo(() => {
    const q = norm(toSearch);

    const base = allDistricts.filter(d => entryMatchesQuery(d, q));

    // No query: group by city, with the city itself (eponymous row) first,
    // then its districts alphabetically.
    if (!q) return [...base].sort((a, b) => {
      const c = a.cityName.localeCompare(b.cityName);
      if (c !== 0) return c;
      const aEpo = isEponymous(a), bEpo = isEponymous(b);
      if (aEpo && !bEpo) return -1;
      if (!aEpo && bEpo) return 1;
      return a.districtName.localeCompare(b.districtName);
    });

    return [...base].sort((a, b) => {
      // 1. Eponymous district comes first (Zugdidi › Zugdidi before Zugdidi › Mestia)
      const aEpo = isEponymous(a);
      const bEpo = isEponymous(b);
      if (aEpo && !bEpo) return -1;
      if (!aEpo && bEpo) return 1;

      // 2. Cities that START with the query rank above those that just contain it
      const aCityStart = norm(a.cityName).startsWith(q) || norm(a.cityNameGeo ?? '').startsWith(q);
      const bCityStart = norm(b.cityName).startsWith(q) || norm(b.cityNameGeo ?? '').startsWith(q);
      if (aCityStart && !bCityStart) return -1;
      if (!aCityStart && bCityStart) return 1;

      // 3. Districts that START with the query rank above partial matches
      const aDistStart = norm(a.districtName).startsWith(q) || norm(a.districtNameGeo ?? '').startsWith(q);
      const bDistStart = norm(b.districtName).startsWith(q) || norm(b.districtNameGeo ?? '').startsWith(q);
      if (aDistStart && !bDistStart) return -1;
      if (!aDistStart && bDistStart) return 1;

      // 4. Alphabetical fallback
      return a.cityName.localeCompare(b.cityName) || a.districtName.localeCompare(b.districtName);
    });
  }, [allDistricts, toSearch]);

  // ── Computed final price ────────────────────────────────────────────────────
  /** Final price shown to user — null when no destination is selected */
  const finalPrice = useMemo<number | null>(() => {
    return selectedEntry && basePrice ? basePrice.price : null;
  }, [selectedEntry, basePrice]);

  const isFlatRate = false;

  // ── Labels ──────────────────────────────────────────────────────────────────
  const displayName = (en: string, geo?: string | null) => lang === 'ka' && geo ? geo : en;
  const cityLabel   = (c: CityEntry) => displayName(c.name, c.nameGeo);

  function selectCity(c: CityEntry) {
    setSelectedCity(c.name);
    setFromSearch(cityLabel(c));
    setFromOpen(false);
  }

  function selectEntry(d: AllDistrictEntry) {
    setSelectedEntry(d);
    setToSearch(
      isEponymous(d)
        ? displayName(d.cityName, d.cityNameGeo)
        : `${displayName(d.cityName, d.cityNameGeo)} › ${displayName(d.districtName, d.districtNameGeo)}`
    );
    setToOpen(false);
    setSelectedTierId(null); // reset tier on new destination
  }

  function reset() {
    setSelectedCity(''); setFromSearch('');
    setSelectedEntry(null); setToSearch('');
    setBasePrice(null); setPriceError(false);
    setSelectedTierId(null);
    setTimeout(() => fromInputRef.current?.focus(), 50);
  }

  const pad = compact ? '14px 16px 18px' : '20px 20px 24px';

  if (loadingData) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', color: C.textSubtle, fontSize: '0.88rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {t.calcLoading}
      </div>
    );
  }

  return (
    <div style={{ padding: pad }}>

      {/* ── From ── */}
      <div style={{ marginBottom: 14, position: 'relative' }} ref={fromWrapRef}>
        <label style={LABEL}>{t.calcFrom}</label>
        <SearchInput
          inputRef={fromInputRef}
          value={fromSearch}
          onChange={v => { setFromSearch(v); setSelectedCity(''); setFromOpen(true); }}
          onFocus={() => setFromOpen(true)}
          onClear={() => { setFromSearch(''); setSelectedCity(''); setFromOpen(false); }}
          placeholder={lang === 'ka' ? 'ქალაქი...' : 'Search city…'}
          isOpen={fromOpen}
        />
        {fromOpen && (
          <div style={DROPDOWN}>
            {filteredCities.length === 0
              ? <div style={EMPTY}>{lang === 'ka' ? 'შედეგი არ მოიძებნა' : 'No results'}</div>
              : filteredCities.map(c => {
                  const sel = selectedCity === c.name;
                  const hov = fromHoverId === c.id;
                  return (
                    <div
                      key={c.id}
                      onMouseDown={e => { e.preventDefault(); selectCity(c); }}
                      onMouseEnter={() => setFromHoverId(c.id)}
                      onMouseLeave={() => setFromHoverId(null)}
                      style={{ ...OPTION, background: sel ? C.accentDim : hov ? C.bg3 : C.bg }}
                    >
                      <span style={{ fontSize: '0.88rem', color: C.text, fontWeight: sel ? 600 : 400, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        {cityLabel(c)}
                      </span>
                      {sel && <Tick />}
                    </div>
                  );
                })
            }
          </div>
        )}
      </div>

      {/* ── To ── */}
      <div style={{ marginBottom: 16, position: 'relative' }} ref={toWrapRef}>
        <label style={LABEL}>{t.calcTo}</label>
        <SearchInput
          inputRef={toInputRef}
          value={toSearch}
          onChange={v => { setToSearch(v); setSelectedEntry(null); setBasePrice(null); setToOpen(true); }}
          onFocus={() => setToOpen(true)}
          onClear={() => { setToSearch(''); setSelectedEntry(null); setBasePrice(null); setToOpen(false); }}
          placeholder={t.calcToPlaceholder}
          isOpen={toOpen}
        />
        {toOpen && (
          <div style={DROPDOWN}>
            {filteredDistricts.length === 0
              ? <div style={EMPTY}>{lang === 'ka' ? 'შედეგი არ მოიძებნა' : 'No results'}</div>
              : filteredDistricts.map(d => {
                  const sel  = selectedEntry?.districtId === d.districtId;
                  const hov  = toHoverId === d.districtId;
                  const city = displayName(d.cityName, d.cityNameGeo);
                  const dist = displayName(d.districtName, d.districtNameGeo);
                  const eponym = isEponymous(d);
                  return (
                    <div
                      key={d.districtId}
                      onMouseDown={e => { e.preventDefault(); selectEntry(d); }}
                      onMouseEnter={() => setToHoverId(d.districtId)}
                      onMouseLeave={() => setToHoverId(null)}
                      style={{ ...OPTION, background: sel ? C.accentDim : hov ? C.bg3 : C.bg }}
                    >
                      <span style={{ fontSize: '0.88rem', color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        {eponym ? (
                          /* The city itself — shown first in its group as the bare city name. */
                          <span style={{ fontWeight: 600, color: C.text }}>{city}</span>
                        ) : (
                          <>
                            <span style={{ color: C.textSubtle, fontSize: '0.82rem' }}>{city}</span>
                            <span style={{ color: C.textSubtle, margin: '0 2px' }}>›</span>
                            <span style={{ fontWeight: 500, color: C.text }}>{dist}</span>
                          </>
                        )}
                      </span>
                      {sel && <Tick />}
                    </div>
                  );
                })
            }
          </div>
        )}
      </div>

      {/* ── Weight tiers ── */}
      {weightTiers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={LABEL}>{t.calcWeightTier}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {/* "Any / standard" chip */}
            <button
              type="button"
              onClick={() => setSelectedTierId(null)}
              style={tierChipStyle(selectedTierId === null, false)}
            >
              {lang === 'ka' ? 'ნებისმიერი' : 'Any'}
            </button>
            {weightTiers.map(tier => {
              const label = tier.label
                ? `${tier.label} (${tier.minWeightKg}–${tier.maxWeightKg}kg)`
                : `${tier.minWeightKg}–${tier.maxWeightKg}kg`;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id === selectedTierId ? null : tier.id)}
                  style={tierChipStyle(selectedTierId === tier.id, false)}
                >
                  {label}
                </button>
              );
            })}
          </div>
            </div>
          )}

      {/* ── Price result ── */}
      <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: 16 }}>
        <span style={LABEL}>
          {isFlatRate ? t.calcFlatRate : token ? t.calcYourPrice : t.calcPrice}
        </span>

        {!selectedEntry && !isFlatRate && !loadingPrice && (
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: C.textSubtle, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {t.calcSelectDest}
          </p>
        )}

        {loadingPrice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div style={{ width: 16, height: 16, flexShrink: 0, border: `2px solid ${C.border}`, borderTopColor: C.accent, borderRadius: '50%', animation: 'calcSpin 0.7s linear infinite' }} />
            <span style={{ fontSize: '0.88rem', color: C.textSubtle, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcLoading}</span>
          </div>
        )}

        {!loadingPrice && priceError && !isFlatRate && (
          <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: C.error, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcNotSet}</p>
        )}

        {((!loadingPrice && finalPrice != null) || isFlatRate) && (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1, color: (finalPrice ?? 0) > 0 ? C.accent : C.textSubtle, fontFamily: "'Syne', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                {(finalPrice ?? 0) > 0 ? `₾${(finalPrice!).toFixed(2)}` : '—'}
              </span>
              {(finalPrice ?? 0) === 0 && (
                <span style={{ fontSize: '0.82rem', color: C.textSubtle, paddingBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcNotSet}</span>
              )}
            </div>

            {/* Price breakdown when customer has special pricing */}
            {!isFlatRate && basePrice && basePrice.tier !== 'default' && token && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: C.accentDim, color: C.accent, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                  {basePrice.tier === 'capital' ? '🏙 Capital rate' : basePrice.tier === 'city' ? '🌆 City rate' : '📍 District rate'}
                </span>
              </div>
            )}
          </>
        )}

        {(selectedCity || selectedEntry) && (
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 14, background: 'none', border: 'none', cursor: 'pointer', color: C.textSubtle, fontSize: '0.82rem', padding: 0, textDecoration: 'underline', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {t.calcReset}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Tier chip style helper ────────────────────────────────────────────────────

function tierChipStyle(active: boolean, isFlat: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 2,
    padding: '5px 11px',
    border: `1.5px solid ${active ? C.borderFocus : isFlat ? C.accentBorder : C.border}`,
    borderRadius: 100,
    background: active ? C.accentDim : isFlat ? 'rgba(196,127,23,0.04)' : C.bg2,
    color: active ? C.accent : isFlat ? C.accent : C.textMuted,
    fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'all 150ms',
  };
}

// ── PriceCalculatorModal (modal overlay) ──────────────────────────────────────

interface ModalProps { onClose: () => void; }

export function PriceCalculatorModal({ onClose }: ModalProps) {
  const { t } = useLanguage();
  const { token } = useAuth();

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(26,23,20,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 520,
          background: C.bg, borderRadius: C.radius.lg,
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
          animation: 'calcPop 0.25s cubic-bezier(0.34,1.4,0.64,1) both',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px', borderBottom: `1.5px solid ${C.border}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: C.radius.md, background: C.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke={C.accent} strokeWidth="1.8"/>
                <path d="M7 8h10M7 12h5M7 16h3" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M15 13v6M12 16h6" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: C.text, fontFamily: "'Syne', sans-serif" }}>{t.calcTitle}</div>
              <div style={{ fontSize: '0.77rem', color: C.textSubtle, marginTop: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcSubtitle}</div>
            </div>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ width: 30, height: 30, border: 'none', cursor: 'pointer', background: C.bg3, borderRadius: C.radius.sm, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <CalcCore token={token} />
        </div>
      </div>

      <style>{`
        @keyframes calcPop  { from { transform: scale(0.93) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes calcSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── PriceCalculatorCard (inline card for CustomerDashboard) ───────────────────

interface CardProps { token: string; }

export function PriceCalculatorCard({ token }: CardProps) {
  const { t } = useLanguage();
  return (
    <div className="content-card" style={{ overflow: 'visible' }}>
      <div className="content-card__header">
        <span className="content-card__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: C.accent, flexShrink: 0 }}>
            <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M7 8h10M7 12h5M7 16h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <path d="M15 13v6M12 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
          {t.calcTitle}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{t.calcSubtitle}</span>
      </div>
      <CalcCore token={token} compact />
      <style>{`@keyframes calcSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
