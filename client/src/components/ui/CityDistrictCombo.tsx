import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { fetchAllDistrictsFlat } from '../../api/cities';
import type { AllDistrictEntry, District } from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';
import './CityDistrictPicker.css';

/**
 * Single combined City + District picker.
 *
 * Unlike {@link CityDistrictPicker} (two separate fields), this presents one
 * searchable dropdown that lists, for each city, the city itself first (the
 * eponymous district, shown as the bare city name) followed by every district
 * linked to that city as "City › District". Search matches city AND district
 * names in either script — typing Latin finds Georgian entries and vice versa.
 *
 * It is a drop-in replacement for CityDistrictPicker: the same
 * onCityChange / onDistrictChange / onDistrictSelect callbacks fire on select,
 * so pricing-bound consumers keep working unchanged.
 */
interface Props {
  cityValue: string;
  districtValue: string;
  onCityChange: (cityName: string) => void;
  onDistrictChange: (districtName: string) => void;
  onDistrictSelect?: (district: District | null) => void;
  cityError?: string;
  districtError?: string;
  disabled?: boolean;
  /** Optional label override; defaults to the localized "City / District". */
  label?: string;
}

// ── Shared flat-district cache (one fetch for all instances) ──────────────────
let _entries: AllDistrictEntry[] | null = null;
let _inflight: Promise<AllDistrictEntry[]> | null = null;
function loadEntries(): Promise<AllDistrictEntry[]> {
  if (_entries) return Promise.resolve(_entries);
  if (!_inflight) {
    _inflight = fetchAllDistrictsFlat()
      .then(e => { _entries = e; return e; })
      .catch(err => { _inflight = null; throw err; });
  }
  return _inflight;
}

const norm = (s: string) => s.toLowerCase().trim();

/** True when a district's name equals its city name (the "city itself" row). */
function isEponymous(e: AllDistrictEntry): boolean {
  return (
    norm(e.districtName) === norm(e.cityName) ||
    (!!e.districtNameGeo && !!e.cityNameGeo && norm(e.districtNameGeo) === norm(e.cityNameGeo))
  );
}

function toDistrict(e: AllDistrictEntry): District {
  return {
    id: e.districtId,
    districtName: e.districtName,
    districtNameGeo: e.districtNameGeo,
    companyServicePrice: e.companyServicePrice,
    isCapitalTerritory: e.isCapitalTerritory,
    isCityTerritory: e.isCityTerritory,
  };
}

// ── Portal-rendered dropdown (escapes modal overflow) ─────────────────────────
interface DropdownPortalProps {
  anchorRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  children: React.ReactNode;
}
function DropdownPortal({ anchorRef, open, children }: DropdownPortalProps) {
  const [style, setStyle] = useState<React.CSSProperties>({});
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const reposition = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 248 && spaceAbove > spaceBelow;
      setStyle({ position: 'fixed', left: rect.left, width: rect.width, zIndex: 9999,
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }) });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [open, anchorRef]);
  if (!open) return null;
  return createPortal(<div className="cdp-portal" style={style}>{children}</div>, document.body);
}

export function CityDistrictCombo({
  cityValue, districtValue, onCityChange, onDistrictChange, onDistrictSelect,
  cityError, districtError, disabled = false, label,
}: Props) {
  const { t, lang } = useLanguage();

  const [entries,   setEntries]   = useState<AllDistrictEntry[]>(() => _entries ?? []);
  const [loading,   setLoading]   = useState(() => _entries === null);
  const [search,    setSearch]    = useState('');
  const [open,      setOpen]      = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load (cached) ────────────────────────────────────────────────────────
  useEffect(() => {
    if (_entries) { setEntries(_entries); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    loadEntries()
      .then(e => { if (!cancelled) setEntries(e); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Labels ───────────────────────────────────────────────────────────────
  const cityName = useCallback((e: AllDistrictEntry) => lang === 'ka' && e.cityNameGeo ? e.cityNameGeo : e.cityName, [lang]);
  const distName = useCallback((e: AllDistrictEntry) => lang === 'ka' && e.districtNameGeo ? e.districtNameGeo : e.districtName, [lang]);
  const entryLabel = useCallback(
    (e: AllDistrictEntry) => isEponymous(e) ? cityName(e) : `${cityName(e)} › ${distName(e)}`,
    [cityName, distName]
  );

  // ── Currently-selected entry resolved from the controlled values ──────────
  const selectedEntry = useMemo(() => {
    if (!cityValue || !districtValue) return null;
    return entries.find(e => e.cityName === cityValue && e.districtName === districtValue) ?? null;
  }, [entries, cityValue, districtValue]);

  // Keep the closed-state input text in sync with the selection.
  useEffect(() => {
    if (open) return;
    if (selectedEntry) { setSearch(entryLabel(selectedEntry)); return; }
    if (cityValue && districtValue) {
      setSearch(cityValue === districtValue ? cityValue : `${cityValue} › ${districtValue}`);
      return;
    }
    setSearch('');
  }, [selectedEntry, open, entryLabel, cityValue, districtValue]);

  useEffect(() => setHighlight(-1), [search]);

  // ── Ordering: group by city, city-itself first, then districts ────────────
  const ordered = useMemo(() => {
    return [...entries].sort((a, b) => {
      const c = a.cityName.localeCompare(b.cityName);
      if (c !== 0) return c;
      const aEpo = isEponymous(a), bEpo = isEponymous(b);
      if (aEpo && !bEpo) return -1;
      if (!aEpo && bEpo) return 1;
      return a.districtName.localeCompare(b.districtName);
    });
  }, [entries]);

  const matches = (e: AllDistrictEntry, q: string) => {
    if (!q) return true;
    return (
      norm(e.cityName).includes(q) ||
      norm(e.districtName).includes(q) ||
      norm(e.cityNameGeo ?? '').includes(q) ||
      norm(e.districtNameGeo ?? '').includes(q)
    );
  };

  const filtered = useMemo(() => {
    // When the field still shows the selected label, treat it as "no query"
    // so opening the dropdown reveals the full list rather than one row.
    const showingSelected = selectedEntry && search === entryLabel(selectedEntry);
    const q = showingSelected ? '' : norm(search);
    const base = ordered.filter(e => matches(e, q));
    if (!q) return base;
    return [...base].sort((a, b) => {
      const aEpo = isEponymous(a), bEpo = isEponymous(b);
      if (aEpo && !bEpo) return -1;
      if (!aEpo && bEpo) return 1;
      const aCityStart = norm(a.cityName).startsWith(q) || norm(a.cityNameGeo ?? '').startsWith(q);
      const bCityStart = norm(b.cityName).startsWith(q) || norm(b.cityNameGeo ?? '').startsWith(q);
      if (aCityStart && !bCityStart) return -1;
      if (!aCityStart && bCityStart) return 1;
      const aDistStart = norm(a.districtName).startsWith(q) || norm(a.districtNameGeo ?? '').startsWith(q);
      const bDistStart = norm(b.districtName).startsWith(q) || norm(b.districtNameGeo ?? '').startsWith(q);
      if (aDistStart && !bDistStart) return -1;
      if (!aDistStart && bDistStart) return 1;
      return a.cityName.localeCompare(b.cityName) || a.districtName.localeCompare(b.districtName);
    });
  }, [ordered, search, selectedEntry, entryLabel]);

  // ── Outside-click close ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPortal = Array.from(document.querySelectorAll('.cdp-portal')).some(p => p.contains(target));
      if (inPortal) return;
      if (open && wrapRef.current && !wrapRef.current.contains(target)) {
        setOpen(false);
        setSearch(selectedEntry ? entryLabel(selectedEntry) : '');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, selectedEntry, entryLabel]);

  // ── Selection ─────────────────────────────────────────────────────────────
  const select = useCallback((e: AllDistrictEntry) => {
    // Order matters: consumers clear the district inside onCityChange, so set
    // the city first, then the district + the full entry.
    onCityChange(e.cityName);
    onDistrictChange(e.districtName);
    onDistrictSelect?.(toDistrict(e));
    setSearch(entryLabel(e));
    setOpen(false);
  }, [onCityChange, onDistrictChange, onDistrictSelect, entryLabel]);

  const clear = useCallback(() => {
    onCityChange('');
    onDistrictChange('');
    onDistrictSelect?.(null);
    setSearch('');
    inputRef.current?.focus();
  }, [onCityChange, onDistrictChange, onDistrictSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true); return; }
    if      (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); select(filtered[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); setSearch(selectedEntry ? entryLabel(selectedEntry) : ''); }
  };

  const error = districtError || cityError;

  return (
    <div className={`cdp-field${error ? ' cdp-field--error' : ''}`} ref={wrapRef}>
      <label className="cdp-label">{label ?? t.cdpComboLabel} <span className="cdp-required">*</span></label>
      <div className={`cdp-control${open ? ' cdp-control--open' : ''}${disabled ? ' cdp-control--disabled' : ''}`}>
        <input
          ref={inputRef} className="cdp-input" type="text"
          placeholder={t.cdpComboPlaceholder} value={search} autoComplete="off" disabled={disabled}
          onFocus={() => { if (!disabled) setOpen(true); }}
          onKeyDown={handleKeyDown}
          onChange={ev => {
            if (disabled) return;
            setSearch(ev.target.value); setOpen(true);
            if (!ev.target.value) { onCityChange(''); onDistrictChange(''); onDistrictSelect?.(null); }
          }}
        />
        <span className="cdp-adornment">
          {loading ? <span className="cdp-spinner" /> :
            !disabled && search
              ? <button type="button" className="cdp-clear-btn" tabIndex={-1} onMouseDown={ev => { ev.preventDefault(); clear(); }}><XIcon /></button>
              : <ChevronIcon up={open} />
          }
        </span>
      </div>
      <DropdownPortal anchorRef={wrapRef} open={open}>
        <div className="cdp-dropdown">
          {filtered.length > 0 ? (
            <ul className="cdp-list" role="listbox">
              {filtered.map((e, i) => {
                const sel    = selectedEntry?.districtId === e.districtId;
                const epony  = isEponymous(e);
                const showQ  = !(selectedEntry && search === entryLabel(selectedEntry)) ? search : '';
                return (
                  <li key={e.districtId} role="option" aria-selected={sel}
                    className={['cdp-option', sel ? 'cdp-option--selected' : '', i === highlight ? 'cdp-option--highlighted' : ''].join(' ')}
                    onMouseDown={ev => { ev.preventDefault(); select(e); }} onMouseEnter={() => setHighlight(i)}>
                    {epony ? (
                      <span className="cdp-option-label cdp-combo-city-solo">{hl(cityName(e), showQ)}</span>
                    ) : (
                      <span className="cdp-option-label">
                        <span className="cdp-combo-city">{hl(cityName(e), showQ)}</span>
                        <span className="cdp-combo-sep"> › </span>
                        <span className="cdp-combo-dist">{hl(distName(e), showQ)}</span>
                      </span>
                    )}
                    {sel && <TickIcon />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="cdp-empty">{loading ? t.cdpComboLoading : search ? t.cdpComboNoMatch(search) : ''}</p>
          )}
        </div>
      </DropdownPortal>
      {error && <span className="cdp-error-msg">{error}</span>}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────
const XIcon = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
    <path d="M1 1l7 7M8 1L1 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const ChevronIcon = ({ up }: { up: boolean }) => (
  <svg className={`cdp-chevron${up ? ' cdp-chevron--up' : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none">
    <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const TickIcon = () => (
  <svg className="cdp-tick" width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2 7l3.5 3.5L11 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function hl(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return <>{text.slice(0, idx)}<mark className="cdp-mark">{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
}
