import { useState, useEffect, useRef, useMemo } from 'react';
import { fetchAllDistrictsFlat, type AllDistrictEntry } from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';
import { useAuth } from '../../contexts/useAuth';

// ── Hardcoded theme values ────────────────────────────────────────────────────
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
  error:       '#c0392b',
  radius:      { sm: 6, md: 10, lg: 16 },
};

// ── SearchInput must live at MODULE level — never inside another component.
// Defining it inside causes React to treat it as a new type on every parent
// re-render, unmounting the input and losing focus after the first keystroke.
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
          display: 'block',
          width: '100%',
          boxSizing: 'border-box',
          height: 44,
          padding: `0 ${value ? 38 : 14}px 0 14px`,
          border: `1.5px solid ${isOpen ? C.borderFocus : C.border}`,
          borderRadius: C.radius.md,
          fontSize: '0.92rem',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          background: C.bg2,
          color: C.text,
          outline: 'none',
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
            color: C.textSubtle, padding: 4,
            display: 'flex', alignItems: 'center',
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

// ── API ───────────────────────────────────────────────────────────────────────
interface PriceResult {
  price: number;
  tier: 'capital' | 'city' | 'district' | 'default';
}

async function fetchPrice(districtId: string, token?: string | null): Promise<PriceResult> {
  const res = await fetch(`/api/calculator?districtId=${districtId}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Failed');
  return res.json();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
interface Props { onClose: () => void; }

export function PriceCalculatorModal({ onClose }: Props) {
  const { t, lang } = useLanguage();
  const { token }   = useAuth();

  const [allDistricts,      setAllDistricts]      = useState<AllDistrictEntry[]>([]);
  const [loadingDistricts,  setLoadingDistricts]  = useState(true);

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

  // Price
  const [priceResult,   setPriceResult]   = useState<PriceResult | null>(null);
  const [loadingPrice,  setLoadingPrice]  = useState(false);
  const [priceError,    setPriceError]    = useState(false);

  const fromWrapRef  = useRef<HTMLDivElement>(null);
  const toWrapRef    = useRef<HTMLDivElement>(null);
  const fromInputRef = useRef<HTMLInputElement>(null);
  const toInputRef   = useRef<HTMLInputElement>(null);

  // ── Load all districts once ───────────────────────────────────────────────
  useEffect(() => {
    fetchAllDistrictsFlat()
      .then(setAllDistricts)
      .catch(() => {})
      .finally(() => setLoadingDistricts(false));
  }, []);

  // ── Escape to close ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // ── Close dropdowns on outside click ─────────────────────────────────────
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

  // ── Fetch price when destination selected ────────────────────────────────
  useEffect(() => {
    if (!selectedEntry) { setPriceResult(null); return; }
    setLoadingPrice(true);
    setPriceError(false);
    fetchPrice(selectedEntry.districtId, token)
      .then(setPriceResult)
      .catch(() => setPriceError(true))
      .finally(() => setLoadingPrice(false));
  }, [selectedEntry, token]);

  // ── Derived lists ─────────────────────────────────────────────────────────
  const allCities = useMemo(() => {
    const seen = new Map<string, string>();
    allDistricts.forEach(d => {
      if (!seen.has(d.cityName)) seen.set(d.cityName, d.cityNameGeo ?? d.cityName);
    });
    return Array.from(seen.entries()).map(([name, nameGeo]) => ({ id: name, name, nameGeo }));
  }, [allDistricts]);

  const filteredCities = useMemo(() => {
    const q = fromSearch.toLowerCase();
    if (!q) return allCities;
    return allCities.filter(c => {
      const label = lang === 'ka' ? c.nameGeo : c.name;
      return label.toLowerCase().includes(q);
    });
  }, [allCities, fromSearch, lang]);

  const filteredDistricts = useMemo(() => {
    const q = toSearch.toLowerCase();
    if (!q) return allDistricts;
    return allDistricts.filter(d => {
      const city     = lang === 'ka' && d.cityNameGeo     ? d.cityNameGeo     : d.cityName;
      const district = lang === 'ka' && d.districtNameGeo ? d.districtNameGeo : d.districtName;
      return city.toLowerCase().includes(q) || district.toLowerCase().includes(q);
    });
  }, [allDistricts, toSearch, lang]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function cityLabel(c: { name: string; nameGeo: string }) {
    return lang === 'ka' ? c.nameGeo : c.name;
  }

  function entryLabel(d: AllDistrictEntry) {
    const city     = lang === 'ka' && d.cityNameGeo     ? d.cityNameGeo     : d.cityName;
    const district = lang === 'ka' && d.districtNameGeo ? d.districtNameGeo : d.districtName;
    return `${city} › ${district}`;
  }

  function selectCity(c: { id: string; name: string; nameGeo: string }) {
    setSelectedCity(c.name);
    setFromSearch(cityLabel(c));
    setFromOpen(false);
  }

  function selectEntry(d: AllDistrictEntry) {
    setSelectedEntry(d);
    setToSearch(entryLabel(d));
    setToOpen(false);
  }

  function reset() {
    setSelectedCity('');    setFromSearch('');
    setSelectedEntry(null); setToSearch('');
    setPriceResult(null);   setPriceError(false);
    setTimeout(() => fromInputRef.current?.focus(), 50);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(26,23,20,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%', maxWidth: 500,
          background: C.bg,
          borderRadius: C.radius.lg,
          boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
          animation: 'calcPop 0.25s cubic-bezier(0.34,1.4,0.64,1) both',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 16px',
          borderBottom: `1.5px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: C.radius.md,
              background: C.accentDim,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="3" stroke={C.accent} strokeWidth="1.8"/>
                <path d="M7 8h10M7 12h5M7 16h3" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M15 13v6M12 16h6" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: C.text, fontFamily: "'Syne', sans-serif" }}>
                {t.calcTitle}
              </div>
              <div style={{ fontSize: '0.77rem', color: C.textSubtle, marginTop: 1, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {t.calcSubtitle}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 30, height: 30, border: 'none', cursor: 'pointer',
              background: C.bg3, borderRadius: C.radius.sm, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.textMuted,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 20px 24px', overflowY: 'auto', flex: 1 }}>
          {loadingDistricts ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: C.textSubtle, fontSize: '0.88rem', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              {t.calcLoading}
            </div>
          ) : (
            <>
              {/* From */}
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

              {/* To */}
              <div style={{ marginBottom: 20, position: 'relative' }} ref={toWrapRef}>
                <label style={LABEL}>{t.calcTo}</label>
                <SearchInput
                  inputRef={toInputRef}
                  value={toSearch}
                  onChange={v => { setToSearch(v); setSelectedEntry(null); setPriceResult(null); setToOpen(true); }}
                  onFocus={() => setToOpen(true)}
                  onClear={() => { setToSearch(''); setSelectedEntry(null); setPriceResult(null); setToOpen(false); }}
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
                          const city = lang === 'ka' && d.cityNameGeo     ? d.cityNameGeo     : d.cityName;
                          const dist = lang === 'ka' && d.districtNameGeo ? d.districtNameGeo : d.districtName;
                          return (
                            <div
                              key={d.districtId}
                              onMouseDown={e => { e.preventDefault(); selectEntry(d); }}
                              onMouseEnter={() => setToHoverId(d.districtId)}
                              onMouseLeave={() => setToHoverId(null)}
                              style={{ ...OPTION, background: sel ? C.accentDim : hov ? C.bg3 : C.bg }}
                            >
                              <span style={{ fontSize: '0.88rem', color: C.text, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                                <span style={{ color: C.textSubtle, fontSize: '0.82rem' }}>{city}</span>
                                <span style={{ color: C.textSubtle, margin: '0 5px' }}>›</span>
                                <span style={{ fontWeight: 500 }}>{dist}</span>
                              </span>
                              {sel && <Tick />}
                            </div>
                          );
                        })
                    }
                  </div>
                )}
              </div>

              {/* Price */}
              <div style={{ borderTop: `1.5px solid ${C.border}`, paddingTop: 18 }}>
                <span style={LABEL}>{t.calcPrice}</span>

                {!selectedEntry && !loadingPrice && (
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

                {!loadingPrice && priceError && (
                  <p style={{ margin: '8px 0 0', fontSize: '0.88rem', color: C.error, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcNotSet}</p>
                )}

                {!loadingPrice && priceResult && !priceError && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 8 }}>
                    <span style={{ fontSize: '2.4rem', fontWeight: 800, lineHeight: 1, color: priceResult.price > 0 ? C.accent : C.textSubtle, fontFamily: "'Syne', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
                      {priceResult.price > 0 ? `₾${priceResult.price.toFixed(2)}` : '—'}
                    </span>
                    {priceResult.price === 0 && (
                      <span style={{ fontSize: '0.82rem', color: C.textSubtle, paddingBottom: 6, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>{t.calcNotSet}</span>
                    )}
                  </div>
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
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes calcPop  { from { transform: scale(0.93) translateY(8px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes calcSpin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

// ── Module-level shared styles & micro-components ─────────────────────────────
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
  borderBottom: '1px solid #e2ddd7',
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
