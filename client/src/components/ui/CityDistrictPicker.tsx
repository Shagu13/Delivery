import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchCities, fetchDistricts } from '../../api/cities';
import type { City, District } from '../../api/cities';
import { useLanguage } from '../../contexts/useLanguage';
import './CityDistrictPicker.css';

interface Props {
  cityValue: string;
  districtValue: string;
  onCityChange: (cityName: string) => void;
  onDistrictChange: (districtName: string) => void;
  cityError?: string;
  districtError?: string;
  disabled?: boolean;
}

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

export function CityDistrictPicker({ cityValue, districtValue, onCityChange, onDistrictChange, cityError, districtError, disabled = false }: Props) {
    const { t, lang } = useLanguage();

  const [cities,           setCities]           = useState<City[]>([]);
  const [citySearch,       setCitySearch]       = useState(cityValue);
  const [cityOpen,         setCityOpen]         = useState(false);
  const [citiesLoading,    setCitiesLoading]    = useState(false);
  const [cityHighlight,    setCityHighlight]    = useState(-1);

  const [districts,        setDistricts]        = useState<District[]>([]);
  const [districtSearch,   setDistrictSearch]   = useState(districtValue);
  const [districtOpen,     setDistrictOpen]     = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [districtHighlight,setDistrictHighlight]= useState(-1);
  const [selectedCityId,   setSelectedCityId]  = useState<string | null>(null);

  const cityWrapRef      = useRef<HTMLDivElement>(null);
  const districtWrapRef  = useRef<HTMLDivElement>(null);
  const cityInputRef     = useRef<HTMLInputElement>(null);
  const districtInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cityValue) { setCitySearch(''); return; }
    const match = cities.find(c => c.cityName === cityValue);
    setCitySearch(match ? (lang === 'ka' && match.cityNameGeo ? match.cityNameGeo : match.cityName) : cityValue);
  }, [cityValue, cities, lang]);

  useEffect(() => {
    if (!districtValue) { setDistrictSearch(''); return; }
    const match = districts.find(d => d.districtName === districtValue);
    setDistrictSearch(match ? (lang === 'ka' && match.districtNameGeo ? match.districtNameGeo : match.districtName) : districtValue);
  }, [districtValue, districts, lang]);

  useEffect(() => {
    setCitiesLoading(true);
    fetchCities().then(setCities).catch(() => {}).finally(() => setCitiesLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCityId) { setDistricts([]); return; }
    setDistrictsLoading(true);
    fetchDistricts(selectedCityId).then(setDistricts).catch(() => setDistricts([])).finally(() => setDistrictsLoading(false));
  }, [selectedCityId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPortal = Array.from(document.querySelectorAll('.cdp-portal')).some(p => p.contains(target));
      if (!inPortal) {
        if (cityOpen     && cityWrapRef.current     && !cityWrapRef.current.contains(target))     { setCityOpen(false);     setCitySearch(cityValue);        }
        if (districtOpen && districtWrapRef.current && !districtWrapRef.current.contains(target)) { setDistrictOpen(false); setDistrictSearch(districtValue); }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cityOpen, districtOpen, cityValue, districtValue]);

  useEffect(() => setCityHighlight(-1),     [citySearch]);
  useEffect(() => setDistrictHighlight(-1), [districtSearch]);

    const lc = (s: string) => s.toLowerCase();
    const cityLabel = (c: City) => lang === 'ka' && c.cityNameGeo ? c.cityNameGeo : c.cityName;
    const districtLabel = (d: District) => lang === 'ka' && d.districtNameGeo ? d.districtNameGeo : d.districtName;
    const filteredCities = cities.filter(c => lc(cityLabel(c)).includes(lc(citySearch)));
    const filteredDistricts = districts.filter(d => lc(districtLabel(d)).includes(lc(districtSearch)));

  const clearCity = useCallback(() => {
    setCitySearch(''); onCityChange(''); setSelectedCityId(null); setDistrictSearch(''); onDistrictChange('');
    cityInputRef.current?.focus();
  }, [onCityChange, onDistrictChange]);

  const clearDistrict = useCallback(() => {
    setDistrictSearch(''); onDistrictChange(''); districtInputRef.current?.focus();
  }, [onDistrictChange]);

    const selectCity = useCallback((city: City) => {
        setCitySearch(cityLabel(city));   
        setCityOpen(false);
        setSelectedCityId(city.id);
        onCityChange(city.cityName);      
        setDistrictSearch('');
        onDistrictChange('');
        setTimeout(() => districtInputRef.current?.focus(), 60);
    }, [onCityChange, onDistrictChange, lang]);

    const selectDistrict = useCallback((d: District) => {
        setDistrictSearch(districtLabel(d));  
        setDistrictOpen(false);
        onDistrictChange(d.districtName);     
    }, [onDistrictChange, lang]);

  const handleCityKeyDown = (e: React.KeyboardEvent) => {
    if (!cityOpen) { if (e.key === 'ArrowDown' || e.key === 'Enter') setCityOpen(true); return; }
    if      (e.key === 'ArrowDown') { e.preventDefault(); setCityHighlight(h => Math.min(h + 1, filteredCities.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setCityHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && cityHighlight >= 0) { e.preventDefault(); selectCity(filteredCities[cityHighlight]); }
    else if (e.key === 'Escape') { setCityOpen(false); setCitySearch(cityValue); }
  };

  const handleDistrictKeyDown = (e: React.KeyboardEvent) => {
    if (!districtOpen) { if (e.key === 'ArrowDown' || e.key === 'Enter') setDistrictOpen(true); return; }
    if      (e.key === 'ArrowDown') { e.preventDefault(); setDistrictHighlight(h => Math.min(h + 1, filteredDistricts.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setDistrictHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && districtHighlight >= 0) { e.preventDefault(); selectDistrict(filteredDistricts[districtHighlight]); }
    else if (e.key === 'Escape') { setDistrictOpen(false); setDistrictSearch(districtValue); }
  };

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

  return (
    <div className="cdp-row">
      {/* City */}
      <div className={`cdp-field${cityError ? ' cdp-field--error' : ''}`} ref={cityWrapRef}>
        <label className="cdp-label">{t.city} <span className="cdp-required">*</span></label>
        <div className={`cdp-control${cityOpen ? ' cdp-control--open' : ''}${disabled ? ' cdp-control--disabled' : ''}`}>
          <input ref={cityInputRef} className="cdp-input" type="text"
            placeholder={t.phCity} value={citySearch} autoComplete="off"
            disabled={disabled}
            onFocus={() => { if (!disabled) setCityOpen(true); }} onKeyDown={handleCityKeyDown}
            onChange={e => {
              if (disabled) return;
              setCitySearch(e.target.value); setCityOpen(true);
              if (!e.target.value) { onCityChange(''); setSelectedCityId(null); setDistrictSearch(''); onDistrictChange(''); }
            }}
          />
          <span className="cdp-adornment">
            {citiesLoading ? <span className="cdp-spinner" /> :
              !disabled && citySearch
                ? <button type="button" className="cdp-clear-btn" tabIndex={-1} onMouseDown={e => { e.preventDefault(); clearCity(); }}><XIcon /></button>
                : <ChevronIcon up={cityOpen} />
            }
          </span>
        </div>
        <DropdownPortal anchorRef={cityWrapRef} open={cityOpen}>
          <div className="cdp-dropdown">
            {filteredCities.length > 0 ? (
              <ul className="cdp-list" role="listbox">
                {filteredCities.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={c.cityName === cityValue}
                    className={['cdp-option', c.cityName === cityValue ? 'cdp-option--selected' : '', i === cityHighlight ? 'cdp-option--highlighted' : ''].join(' ')}
                    onMouseDown={e => { e.preventDefault(); selectCity(c); }} onMouseEnter={() => setCityHighlight(i)}>
                        <span className="cdp-option-label">{highlight(cityLabel(c), citySearch)}</span>
                    {c.cityName === cityValue && <TickIcon />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cdp-empty">{citiesLoading ? t.cdpLoadingCities : citySearch ? t.cdpNoCityMatch(citySearch) : t.cdpNoCities}</p>
            )}
          </div>
        </DropdownPortal>
        {cityError && <span className="cdp-error-msg">{cityError}</span>}
      </div>

      {/* District */}
      <div className={`cdp-field${districtError ? ' cdp-field--error' : ''}`} ref={districtWrapRef}>
        <label className="cdp-label">{t.district} <span className="cdp-required">*</span></label>
        <div className={`cdp-control${districtOpen ? ' cdp-control--open' : ''}${!selectedCityId || disabled ? ' cdp-control--disabled' : ''}`}>
          <input ref={districtInputRef} className="cdp-input" type="text"
            placeholder={selectedCityId ? t.phDistrict : t.phCityFirst}
            value={districtSearch} autoComplete="off" disabled={!selectedCityId || disabled}
            onFocus={() => { if (selectedCityId && !disabled) setDistrictOpen(true); }} onKeyDown={handleDistrictKeyDown}
            onChange={e => { if (disabled) return; setDistrictSearch(e.target.value); setDistrictOpen(true); if (!e.target.value) onDistrictChange(''); }}
          />
          <span className="cdp-adornment">
            {districtsLoading ? <span className="cdp-spinner" /> :
              districtSearch
                ? <button type="button" className="cdp-clear-btn" tabIndex={-1} onMouseDown={e => { e.preventDefault(); clearDistrict(); }}><XIcon /></button>
                : <ChevronIcon up={districtOpen} />
            }
          </span>
        </div>
        <DropdownPortal anchorRef={districtWrapRef} open={districtOpen}>
          <div className="cdp-dropdown">
            {filteredDistricts.length > 0 ? (
              <ul className="cdp-list" role="listbox">
                {filteredDistricts.map((d, i) => (
                  <li key={d.id} role="option" aria-selected={d.districtName === districtValue}
                    className={['cdp-option', d.districtName === districtValue ? 'cdp-option--selected' : '', i === districtHighlight ? 'cdp-option--highlighted' : ''].join(' ')}
                    onMouseDown={e => { e.preventDefault(); selectDistrict(d); }} onMouseEnter={() => setDistrictHighlight(i)}>
                        <span className="cdp-option-label">{highlight(districtLabel(d), districtSearch)}</span>
                    {d.districtName === districtValue && <TickIcon />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="cdp-empty">{districtsLoading ? t.cdpLoadingDistricts : districtSearch ? t.cdpNoDistrictMatch(districtSearch) : t.cdpNoDistricts}</p>
            )}
          </div>
        </DropdownPortal>
        {districtError && <span className="cdp-error-msg">{districtError}</span>}
      </div>
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return <>{text.slice(0, idx)}<mark className="cdp-mark">{text.slice(idx, idx + query.length)}</mark>{text.slice(idx + query.length)}</>;
}
