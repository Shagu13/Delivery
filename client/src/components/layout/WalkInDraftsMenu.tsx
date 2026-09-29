import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/useLanguage';
import type { Translations } from '../../contexts/translations';
import { useWalkInDrafts, type WalkInDraft } from '../../hooks/useWalkInDrafts';
import { ConfirmDialog } from '../ui/ConfirmDialog';

function formatSavedAgo(savedAt: number, t: Translations): string {
  const mins = Math.floor((Date.now() - savedAt) / 60000);
  if (mins < 1) return t.widSavedJustNow;
  if (mins < 60) return t.widSavedMinutesAgo.replace('{n}', String(mins));
  return t.widSavedHoursAgo.replace('{n}', String(Math.floor(mins / 60)));
}

/**
 * Basket of unsaved walk-in "Add Package" drafts, shown in the top staff nav so it's reachable
 * from anywhere in the admin/operator portal — not just the page the walk-in modal lives on.
 * Resuming navigates to the admin dashboard with ?resumeDraft=<id>, which AdminDashboard picks
 * up and opens AddPackageModal pre-filled (see AdminDashboard.tsx).
 */
export function WalkInDraftsMenu() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { drafts, count, deleteDraft } = useWalkInDrafts();

  const [open, setOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<WalkInDraft | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const resume = (draft: WalkInDraft) => {
    setOpen(false);
    navigate(`/admin?resumeDraft=${encodeURIComponent(draft.id)}`);
  };

  return (
    <div className="wid-wrap" ref={wrapRef}>
      <button
        type="button"
        className="nav__pending-btn"
        onClick={() => setOpen(o => !o)}
        aria-label={`${t.widBasketTitle}: ${count}`}
        title={t.widBasketTitle}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4" />
          <path d="M3 6h18" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
        {count > 0 && (
          <span className="nav__pending-badge">{count > 99 ? '99+' : count}</span>
        )}
      </button>

      {open && (
        <div className="wid-menu">
          <div className="wid-menu__title">{t.widMenuTitle}</div>
          {drafts.length === 0 && <div className="wid-menu__empty">{t.widEmpty}</div>}
          {drafts.map(d => {
            const name = d.selected?.businessName || d.cust.businessName || '—';
            const phone = d.selected?.phoneNumber || d.cust.phoneNumber || '';
            return (
              <div key={d.id} className="wid-item">
                <div className="wid-item__main">
                  <div className="wid-item__name">{name}</div>
                  <div className="wid-item__meta">
                    {phone ? `${phone} · ` : ''}{d.pkgs.length} {t.widPackagesLabel}
                  </div>
                  <div className="wid-item__meta">{formatSavedAgo(d.savedAt, t)}</div>
                </div>
                <div className="wid-item__actions">
                  <button type="button" className="wid-item__resume" onClick={() => resume(d)}>{t.widResume}</button>
                  <button type="button" className="wid-item__discard" onClick={() => setDiscardTarget(d)}>{t.widDiscard}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={discardTarget !== null}
        title={t.widDiscardTitle}
        message={t.widDiscardMessage}
        confirmLabel={t.widDiscard}
        variant="danger"
        onConfirm={() => {
          if (discardTarget) deleteDraft(discardTarget.id);
          setDiscardTarget(null);
        }}
        onCancel={() => setDiscardTarget(null)}
      />

      <style>{`
        .wid-wrap { position: relative; }
        .wid-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 1000;
          width: 280px;
          max-height: 360px;
          overflow-y: auto;
          background: var(--color-bg-2);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          box-shadow: 0 8px 24px rgba(0,0,0,0.16);
          padding: 8px;
        }
        .wid-menu__title { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-subtle); padding: 4px 6px 8px; }
        .wid-menu__empty { font-size: 0.8rem; color: var(--color-text-muted); padding: 8px 6px; }
        .wid-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding: 8px 6px; border-radius: var(--radius-sm); }
        .wid-item + .wid-item { border-top: 1px solid var(--color-border); }
        .wid-item__name { font-size: 0.84rem; font-weight: 700; color: var(--color-text); }
        .wid-item__meta { font-size: 0.72rem; color: var(--color-text-muted); margin-top: 2px; }
        .wid-item__actions { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
        .wid-item__resume { background: var(--color-accent-dim); border: 1px solid rgba(196,127,23,0.4); color: var(--color-accent); border-radius: var(--radius-sm); font-size: 0.72rem; font-weight: 600; padding: 4px 8px; cursor: pointer; }
        .wid-item__discard { background: none; border: none; color: #ef4444; font-size: 0.72rem; font-weight: 600; cursor: pointer; padding: 4px 8px; }
      `}</style>
    </div>
  );
}
