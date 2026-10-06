import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/useAuth';
import type { AdminCustomer } from '../api/customers';
import type { CustForm, PkgRow } from '../pages/Admin/AddPackageModal';

/** A not-yet-submitted walk-in "Add Package" form, saved so closing the modal (by any path —
 *  backdrop click, the header close, or Cancel) never loses entered data. */
export interface WalkInDraft {
  id: string;
  savedAt: number;
  cust: CustForm;
  selected: AdminCustomer | null;
  pkgs: PkgRow[];
}

// Scoped per staff user (mirrors CartProvider's per-customer `delivery_cart_` scoping) so two
// admins/operators on a shared office computer don't see each other's in-progress drafts.
const KEY_PREFIX = 'delivery_walkin_drafts_';
const EXPIRY_MS = 24 * 60 * 60 * 1000;
// localStorage's native `storage` event never fires in the tab that wrote it, so the modal
// (writer) and the staff-nav drafts menu (reader) sync through this custom event instead.
const CHANGE_EVENT = 'walkin-drafts-changed';

function keyFor(username: string | undefined): string {
  return `${KEY_PREFIX}${username ?? 'anon'}`;
}

function readRaw(key: string): WalkInDraft[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WalkInDraft[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(key: string, drafts: WalkInDraft[]) {
  try {
    localStorage.setItem(key, JSON.stringify(drafts));
  } catch { /* storage unavailable — drafts just won't persist */ }
}

/** Reads drafts for a user, dropping any older than 24h and persisting the prune. */
function loadFresh(key: string): WalkInDraft[] {
  const all = readRaw(key);
  const fresh = all.filter(d => Date.now() - d.savedAt <= EXPIRY_MS);
  if (fresh.length !== all.length) writeRaw(key, fresh);
  return fresh;
}

function notifyChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Basket of unsubmitted walk-in drafts for the signed-in staff user — browser-only (no
 *  backend), supports several drafts in parallel, each expiring 24h after it was last saved.
 *  Used by AddPackageModal (writer) and the staff-nav drafts menu (reader/discarder). */
export function useWalkInDrafts() {
  const { user } = useAuth();
  const key = keyFor(user?.username);

  const [drafts, setDrafts] = useState<WalkInDraft[]>(() => loadFresh(key));

  useEffect(() => {
    setDrafts(loadFresh(key));
    const onChange = () => setDrafts(loadFresh(key));
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, [key]);

  const saveDraft = useCallback((draft: WalkInDraft) => {
    const next = [...readRaw(key).filter(d => d.id !== draft.id), draft];
    writeRaw(key, next);
    notifyChanged();
  }, [key]);

  const deleteDraft = useCallback((id: string) => {
    writeRaw(key, readRaw(key).filter(d => d.id !== id));
    notifyChanged();
  }, [key]);

  const clearDrafts = useCallback(() => {
    writeRaw(key, []);
    notifyChanged();
  }, [key]);

  const getDraft = useCallback(
    (id: string): WalkInDraft | null => loadFresh(key).find(d => d.id === id) ?? null,
    [key],
  );

  return { drafts, count: drafts.length, saveDraft, deleteDraft, clearDrafts, getDraft };
}
