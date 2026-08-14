import { Fragment, useEffect, useState } from 'react';

interface DebouncedSearchBoxProps {
  /** Seeds the input on mount (e.g. a deep-link "Go To" search). */
  initialValue?: string;
  /** Called with the settled value once the debounce elapses. */
  onChange: (value: string) => void;
  placeholder: string;
  /** Milliseconds to wait after the admin stops typing before calling onChange. */
  debounceMs?: number;
  /** Below this many characters (but above zero), onChange is held back and minCharsHint
   *  shows instead — a short prefix is too broad a filter to be worth a query. */
  minChars?: number;
  minCharsHint?: string;
}

/**
 * Search input that owns its own per-keystroke state and debounce timer, so typing only
 * re-renders this small component rather than whatever (potentially large) results list the
 * parent renders from the debounced value. The Packages/Delivery admin pages used to keep the
 * raw keystroke value in their own top-level state, which meant every character re-ran those
 * pages' entire render (a large table's worth of work) before the typed letter could even show.
 */
export function DebouncedSearchBox({
  initialValue = '', onChange, placeholder, debounceMs = 300, minChars = 0, minCharsHint,
}: DebouncedSearchBoxProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length > 0 && trimmed.length < minChars) return;
    const timer = setTimeout(() => onChange(value), debounceMs);
    return () => clearTimeout(timer);
    // onChange intentionally excluded — callers pass an inline setState function, which is
    // stable in identity-independent terms (React setState) but not guaranteed referentially
    // stable across renders; re-running this effect on that alone would defeat the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs, minChars]);

  const trimmedLength = value.trim().length;
  const showHint = !!minCharsHint && trimmedLength > 0 && trimmedLength < minChars;

  return (
    <Fragment>
      <div className="go-search" style={{ flexShrink: 0 }}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 10l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          autoComplete="off"
        />
        {value && (
          <button onClick={() => setValue('')} className="go-search-clear" aria-label="Clear search">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
      {showHint && (
        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', flexShrink: 0 }}>{minCharsHint}</span>
      )}
    </Fragment>
  );
}
