import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/useLanguage';
import type { Lang } from '../../contexts/translations';

interface Props {
  className?: string;
}

const OPTIONS: { value: Lang; label: string; native: string }[] = [
  { value: 'en', label: 'ENG', native: 'English'   },
  { value: 'ka', label: 'ქარ', native: 'ქართული' },
];

export function LanguageToggle({ className = '' }: Props) {
  const { lang, setLang } = useLanguage();
  const [open,      setOpen]      = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const btnRef     = useRef<HTMLButtonElement>(null);
  const portalRef  = useRef<HTMLUListElement>(null);

  const active = OPTIONS.find(o => o.value === lang) ?? OPTIONS[0];

  // Position the portal next to the button, flipping above it when there isn't
  // enough room below (e.g. the toggle sits low in the viewport). Without this the
  // fixed-position menu can render off the bottom edge and be unreachable.
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW   = Math.max(r.width, 140);
    const estH    = 110; // ~2 options
    const flipUp  = window.innerHeight - r.bottom < estH + 12 && r.top > window.innerHeight - r.bottom;
    const left    = Math.max(8, Math.min(r.left, window.innerWidth - menuW - 8));
    setDropStyle({
      position  : 'fixed',
      left,
      minWidth  : menuW,
      zIndex    : 99999,
      maxHeight : '70vh',
      overflowY : 'auto',
      ...(flipUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
    });
  }, [open]);

  // Close on outside click — use mousedown so it fires before blur
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t))    return; // clicking the button toggles
      if (portalRef.current?.contains(t)) return; // clicking inside dropdown — let it handle
      setOpen(false);
    };
    // Use capture:false so element handlers fire first
    document.addEventListener('mousedown', handler, false);
    return () => document.removeEventListener('mousedown', handler, false);
  }, [open]);

  const toggle = () => setOpen(v => !v);

  const select = (value: Lang) => {
    setLang(value);
    setOpen(false);
  };

  return (
    <>
      {/* Trigger */}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`ltog-btn${open ? ' ltog-btn--open' : ''} ${className}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {/* Globe */}
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
          <ellipse cx="8" cy="8" rx="2.9" ry="6.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1.5 6h13M1.5 10h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>

        <span className="ltog-btn__label">{active.label}</span>

        {/* Chevron */}
        <svg
          className={`ltog-chevron${open ? ' ltog-chevron--up' : ''}`}
          width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true"
        >
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown portal */}
      {open && createPortal(
        <ul
          ref={portalRef}
          className="ltog-list"
          style={dropStyle}
          role="listbox"
          aria-label="Language"
        >
          {OPTIONS.map(opt => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === lang}
              className={`ltog-option${opt.value === lang ? ' ltog-option--active' : ''}`}
              onClick={() => select(opt.value)}
            >
              <span className="ltog-option__code">{opt.label}</span>
              <span className="ltog-option__native">{opt.native}</span>
              {opt.value === lang && (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6.5l2.5 2.5L10 3" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </li>
          ))}
        </ul>,
        document.body,
      )}

      <style>{`
        /* ── Trigger ──────────────────────────────────────────────────── */
        .ltog-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 10px;
          background: var(--color-bg-3, #f3f4f6);
          border: 1.5px solid var(--color-border, #e5e7eb);
          border-radius: 8px;
          color: var(--color-text-muted, #6b7280);
          font-family: var(--font-body, inherit);
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
          transition: border-color 0.14s, background 0.14s, color 0.14s;
        }
        .ltog-btn:hover,
        .ltog-btn--open {
          border-color: var(--color-accent, #c47f17);
          background: color-mix(in srgb, var(--color-accent, #c47f17) 9%, var(--color-bg-3, #f3f4f6));
          color: var(--color-accent, #c47f17);
        }
        .ltog-chevron {
          opacity: 0.65;
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }
        .ltog-chevron--up { transform: rotate(180deg); }

        /* ── Dropdown ─────────────────────────────────────────────────── */
        .ltog-list {
          list-style: none;
          margin: 0;
          padding: 4px 0;
          background: var(--color-bg, #ffffff);
          border: 1.5px solid var(--color-border, #e5e7eb);
          border-radius: 10px;
          box-shadow:
            0 4px 6px -1px rgba(0,0,0,0.08),
            0 12px 28px -4px rgba(0,0,0,0.14);
          animation: ltog-pop 0.13s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden;
        }
        @keyframes ltog-pop {
          from { opacity:0; transform: scaleY(0.9) translateY(-4px); transform-origin: top; }
          to   { opacity:1; transform: scaleY(1)   translateY(0);    transform-origin: top; }
        }

        /* ── Option ───────────────────────────────────────────────────── */
        .ltog-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 14px;
          cursor: pointer;
          font-size: 0.875rem;
          color: var(--color-text, #111827);
          transition: background 0.08s;
        }
        .ltog-option:hover {
          background: var(--color-bg-3, #f9fafb);
        }
        .ltog-option--active {
          background: color-mix(in srgb, var(--color-accent, #c47f17) 9%, transparent);
          color: var(--color-accent, #c47f17);
        }
        .ltog-option--active:hover {
          background: color-mix(in srgb, var(--color-accent, #c47f17) 14%, transparent);
        }
        .ltog-option__code {
          font-weight: 700;
          letter-spacing: 0.04em;
          min-width: 30px;
        }
        .ltog-option__native {
          flex: 1;
          font-size: 0.8rem;
          color: var(--color-text-muted, #9ca3af);
        }
        .ltog-option--active .ltog-option__native {
          color: inherit;
          opacity: 0.75;
        }
      `}</style>
    </>
  );
}
