import { useEffect, useRef, useState } from 'react';
import { useAddressAutocomplete, type AddressSuggestion } from './useAddressAutocomplete';
import { useAuth } from '../../contexts/useAuth';
import './addressAutocomplete.css';

/**
 * Drop-in replacement for <FormField> on address inputs. Renders the same
 * `.form-field` markup so it matches the surrounding form visually, then adds
 * a suggestions dropdown sourced from the backend's `/api/address/autocomplete`
 * proxy. When the user isn't signed in (no token) or the backend has no key
 * configured, it behaves exactly like a plain text field.
 */
interface Props {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** 'ka' | 'en' — passed through to Geoapify for localized results. */
  lang?: string;
  disabled?: boolean;
}

export function AddressAutocomplete({
  label, value, onValueChange, error, required, placeholder, maxLength, lang = 'en', disabled,
}: Props) {
  // `query` is set only when the user actually types, so selecting a suggestion
  // (or an external auto-fill) does not re-trigger a network request.
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { token } = useAuth();

  const { suggestions, loading } = useAddressAutocomplete(query, { lang, token });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => setHighlight(-1), [suggestions]);

  const select = (s: AddressSuggestion) => {
    onValueChange(s.formatted);
    setQuery('');
    setOpen(false);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onValueChange(v);
    setQuery(v);
    setOpen(true);
  };

  const showMenu = open && (loading || suggestions.length > 0);
  const noMatch = open && !loading && query.trim().length >= 3 && suggestions.length === 0;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMenu) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && highlight >= 0) { e.preventDefault(); select(suggestions[highlight]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className={`form-field ${error ? 'form-field--error' : ''} addr-ac`} ref={wrapRef}>
      <label className="form-field__label">
        {label}
        {required && <span className="form-field__required">*</span>}
      </label>
      <div className="addr-ac__control">
        <input
          className="form-field__input"
          value={value}
          onChange={handleInput}
          onFocus={() => { if (query) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete="off"
        />
        {loading && <span className="addr-ac__spinner" aria-hidden="true" />}

        {(showMenu || noMatch) && (
          <div className="addr-ac__menu" role="listbox">
            {suggestions.map((s, i) => (
              <button
                type="button"
                key={`${s.formatted}-${i}`}
                role="option"
                aria-selected={i === highlight}
                className={`addr-ac__option${i === highlight ? ' addr-ac__option--hl' : ''}`}
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={e => { e.preventDefault(); select(s); }}
              >
                <span className="addr-ac__option-main">{s.addressLine1 || s.formatted}</span>
                {s.addressLine2 && <span className="addr-ac__option-sub">{s.addressLine2}</span>}
              </button>
            ))}
            {noMatch && <p className="addr-ac__empty">{lang === 'ka' ? 'ვერ მოიძებნა' : 'No matches'}</p>}
            <div className="addr-ac__attribution">Powered by Geoapify</div>
          </div>
        )}
      </div>
      {error && <span className="form-field__error">{error}</span>}
    </div>
  );
}
