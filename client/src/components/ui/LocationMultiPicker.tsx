import { useState, useEffect, useRef, useMemo } from 'react';
import { useLanguage } from '../../contexts/useLanguage';

// ── Multi city/district checkbox dropdown, with a typable search box ──
// Shared by AdminPackagesPage (city/district package filters) and AdminFinancePage
// (recipient-area finance filters) — keep both call sites in sync when changing this.

export interface LocationMultiPickerProps {
  available: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  geoMap: Record<string, string | undefined>;
  locLabel: (en: string, geo?: string | null) => string;
  allLabel: string;         // trigger text when nothing's selected, e.g. "All cities"
  disabled?: boolean;
}

export function LocationMultiPicker({ available, selected, onChange, geoMap, locLabel, allLabel, disabled }: LocationMultiPickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter(v => v.toLowerCase().includes(q) || (geoMap[v] ?? '').toLowerCase().includes(q));
  }, [available, query, geoMap]);

  const label = selected.length === 0 ? allLabel
    : selected.length === 1 ? locLabel(selected[0], geoMap[selected[0]])
    : t.goNLocationsSelected(selected.length);

  return (
    <div className="dmp-root" ref={ref}>
      <button
        type="button"
        className={`dmp-trigger${selected.length > 0 ? ' dmp-trigger--active' : ''}${disabled ? ' dmp-trigger--disabled' : ''}`}
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        </svg>
        <span className="dmp-label">{label}</span>
        {selected.length > 0 && (
          <span className="dmp-clear" role="button" tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange([]); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onChange([]); } }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </span>
        )}
        <svg className="dmp-chevron" width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && !disabled && (
        <div className="dmp-dropdown">
          <div className="dmp-search">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/><path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            <input ref={inputRef} type="text" className="dmp-search-input" value={query}
              onChange={e => setQuery(e.target.value)} placeholder={t.goLocationSearchPh} autoComplete="off" />
          </div>
          <div className="dmp-dropdown-header">
            <span className="dmp-dropdown-title">{t.goNLocationsSelected(selected.length)}</span>
            <button className="dmp-select-all" onClick={() => onChange(selected.length === available.length ? [] : [...available])}>
              {selected.length === available.length ? t.goClear : t.pillAll}
            </button>
          </div>
          <div className="dmp-list">
            {filtered.length === 0 && <div className="dmp-empty">{t.goNoLocationMatches}</div>}
            {filtered.map(v => {
              const checked = selected.includes(v);
              return (
                <div key={v} className={`dmp-item${checked ? ' dmp-item--checked' : ''}`} onClick={() => toggle(v)}>
                  <span className="dmp-item-label">{locLabel(v, geoMap[v])}</span>
                  <button type="button" className={`dmp-tick${checked ? ' dmp-tick--on' : ''}`}
                    onClick={e => { e.stopPropagation(); toggle(v); }}
                    title={checked ? t.goDeselect : t.goSelect}>
                    <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
