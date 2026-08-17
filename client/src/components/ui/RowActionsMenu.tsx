import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './RowActionsMenu.css';

export interface RowActionItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Renders the item in the error color (destructive actions: deactivate, delete, …). */
  danger?: boolean;
}

interface Props {
  items: RowActionItem[];
  /** Accessible label for the kebab trigger button. */
  label: string;
}

/**
 * Generic per-row kebab (⋮) menu for dense admin tables — a flat list of one-click actions,
 * portaled to <body> and positioned against the trigger button so a table's horizontal
 * scroll/overflow never clips it. For actions that need their own sub-form (courier picker,
 * cancellation reason, …) see the order-specific `OrderRowActionsMenu` instead; this one is
 * for tables where every action already opens its own modal.
 */
export function RowActionsMenu({ items, label }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = items.length * 36 + 12;
    const menuW = 190;
    const left = Math.max(8, r.right - menuW);
    const top = r.bottom + menuH > window.innerHeight ? Math.max(8, r.top - 4 - menuH) : r.bottom + 4;
    setPos({ top, left });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} type="button" className="ram-kebab" title={label} aria-label={label}
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      {open && pos && createPortal(
        <div ref={menuRef} className="ram-menu" style={{ top: pos.top, left: pos.left }}
          onClick={e => e.stopPropagation()}>
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              className={`ram-item${item.danger ? ' ram-item--danger' : ''}`}
              disabled={item.disabled}
              onClick={() => { item.onClick(); close(); }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
