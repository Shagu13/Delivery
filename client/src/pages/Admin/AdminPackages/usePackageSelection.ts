// Everything about the Packages page's delivery-side bulk selection: which packages are
// selected, the assign/prices/deliver bulk-action pool, the salary/price "missing financials"
// gating in front of assign/deliver, export, and print labels. Pulled out of the page component
// because it's one cohesive subsystem with its own state machine (bulk mode → gating warning →
// fill-in modal → resume the original action), not because any of it is reused elsewhere.
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useLanguage } from '../../../contexts/useLanguage';
import { toDateKey } from '../../../utils/georgianTime';
import { printParcelLabels } from '../../../utils/printLabel';
import type { AdminGroupOrder, AdminOrder } from '../../../api/adminGroupOrders';
import type { Courier } from '../../../api/couriers';
import {
  setCourierSalary, setCompanyServicePrice, bulkAssignCourierToOrders,
  adminMarkOrderDelivered, exportOrdersExcel,
} from '../../../api/orders';
import type { AdminOrderItem } from '../AdminOrdersPage';
import { isAssignable, isDeliverable, toOrderItem, buildAdminLabel } from './shared';

export type BulkMode = 'assign' | 'prices' | 'deliver';

export function usePackageSelection({
  displayList, visibleOrdersFor, courierNameById, couriers, token,
  filterCities, filterDistricts, debouncedSearch, filterCourier, filterUnpriced,
  selectedDate, rangeEnd, showToast, reload, reloadAll,
}: {
  displayList: AdminGroupOrder[];
  visibleOrdersFor: (go: AdminGroupOrder) => AdminOrder[];
  courierNameById: Map<string, string>;
  couriers: Courier[];
  token: string;
  filterCities: string[];
  filterDistricts: string[];
  debouncedSearch: string;
  filterCourier: string;
  filterUnpriced: boolean;
  selectedDate: Date | null;
  rangeEnd: Date | null;
  showToast: (msg: string, type?: 'ok' | 'err') => void;
  reload: () => void;
  // Refetches the list/summary data a delivery mutation could have changed. This hook adds
  // clearing its own `selected` state on top (see reloadAfterAction below) — that's specific
  // to this hook's own state, not something the caller's reload plumbing needs to know about.
  reloadAll: () => void;
}) {
  const { t } = useLanguage();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Refetch after a delivery mutation (assign/price/salary/deliver), then drop the selection —
  // it may reference rows that just changed status/left the visible set.
  const reloadAfterAction = useCallback(() => {
    reloadAll();
    setSelected(new Set());
  }, [reloadAll]);

  const [bulkMode, setBulkMode] = useState<BulkMode>('assign');
  const [bulkCourierId, setBulkCourierId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkDelivering, setBulkDelivering] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkSalary, setBulkSalary] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [showSalaryWarning, setShowSalaryWarning] = useState(false);
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [salaryDrafts, setSalaryDrafts] = useState<Record<string, string>>({});
  const [salaryChecked, setSalaryChecked] = useState<Set<string>>(new Set());
  const [salarySaving, setSalarySaving] = useState(false);
  const [showPriceWarning, setShowPriceWarning] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [priceChecked, setPriceChecked] = useState<Set<string>>(new Set());
  const [priceSaving, setPriceSaving] = useState(false);
  // After a price/salary save inside the assign/deliver gating, the original action is
  // resumed automatically (see the effect below) so the admin doesn't have to re-click
  // "Assign"/"Mark delivered" once the missing financials are filled in.
  const [resumeAction, setResumeAction] = useState<null | 'assign' | 'deliver'>(null);

  // Esc leaves deliver mode (mirrors AdminOrdersPage).
  useEffect(() => {
    if (bulkMode !== 'deliver') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showBulkModal || showPriceModal || showSalaryModal || showPriceWarning || showSalaryWarning) return;
      setBulkMode('assign'); setSelected(new Set()); setBulkCourierId('');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bulkMode, showBulkModal, showPriceModal, showSalaryModal, showPriceWarning, showSalaryWarning]);

  // Flat list of every package currently shown, as AdminOrderItem. Drives selection,
  // select-all and the bulk-action pool. Built from displayList so it follows filters.
  const visibleItems = useMemo(() => {
    const out: AdminOrderItem[] = [];
    for (const go of displayList) {
      for (const o of visibleOrdersFor(go)) {
        out.push(toOrderItem(o, go, o.courierId ? (courierNameById.get(o.courierId) ?? null) : null));
      }
    }
    return out;
  }, [displayList, visibleOrdersFor, courierNameById]);

  const itemById = useMemo(() => {
    const m = new Map<string, AdminOrderItem>();
    visibleItems.forEach(it => m.set(it.id, it));
    return m;
  }, [visibleItems]);

  const selectableOrders = useMemo(() =>
    bulkMode === 'assign'  ? visibleItems.filter(isAssignable)  :
    bulkMode === 'deliver' ? visibleItems.filter(isDeliverable) :
    visibleItems,
  [visibleItems, bulkMode]);

  const allSelected  = selectableOrders.length > 0 && selectableOrders.every(o => selected.has(o.id));
  const someSelected = selected.size > 0;
  const toggleAll    = () => setSelected(allSelected ? new Set() : new Set(selectableOrders.map(o => o.id)));
  const toggleOne    = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const rowSelectable = (o: AdminOrderItem) =>
    bulkMode === 'assign' ? isAssignable(o) : bulkMode === 'deliver' ? isDeliverable(o) : true;

  // Per-batch select-all: the ids of just this expanded group order's currently-selectable
  // packages (respecting the active bulk mode + location/delivery filters). Toggling scopes
  // selection to exactly this batch instead of every visible package.
  const groupSelectableIds = (go: AdminGroupOrder) =>
    visibleOrdersFor(go).filter(o => rowSelectable(toOrderItem(o, go, null))).map(o => o.id);

  const toggleGroupAll = (go: AdminGroupOrder) => {
    const ids = groupSelectableIds(go);
    if (ids.length === 0) return;
    setSelected(prev => {
      const allIn = ids.every(id => prev.has(id));
      const next = new Set(prev);
      ids.forEach(id => (allIn ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const actionPool = useMemo(() => {
    const picked = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o);
    if (bulkMode === 'assign')  return picked.filter(isAssignable);
    if (bulkMode === 'deliver') return picked.filter(isDeliverable);
    return picked;
  }, [selected, itemById, bulkMode]);

  // Only warn when no applicable courier default rate covers the order — mirrors the backend
  // auto-fill (a Tbilisi/Rustavi courier's DefaultSalary is applied on assign/deliver) and the
  // Delivery page's gate. Assigning targets the chosen bulkCourierId; delivering keeps an
  // existing assignee and only falls back to bulkCourierId for orders still missing one.
  const missingSalaryOrders = useMemo(() => {
    const bulkCourierDefault = couriers.find(c => c.courierId === bulkCourierId)?.defaultSalary ?? null;
    return actionPool.filter(o => {
      if (o.courierSalary != null) return false;
      const ownerDefault = bulkMode === 'assign'
        ? bulkCourierDefault
        : o.courierId
          ? (couriers.find(c => c.courierId === o.courierId)?.defaultSalary ?? null)
          : bulkCourierDefault;
      return ownerDefault == null;
    });
  }, [actionPool, couriers, bulkCourierId, bulkMode]);
  const missingPriceOrders   = useMemo(() => actionPool.filter(o => !o.companyServicePrice), [actionPool]);
  const missingCourierOrders = useMemo(() => actionPool.filter(o => !o.courierId), [actionPool]);

  // ── Export / labels ─────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      await exportOrdersExcel(token, {
        city:      filterCities.length === 1 ? filterCities[0] : undefined,
        district:  filterDistricts.length === 1 ? filterDistricts[0] : undefined,
        search:    debouncedSearch || undefined,
        courierId: filterCourier || undefined,
        unpriced:  filterUnpriced || undefined,
        activeOnly: selected.size === 0,
        date:      selectedDate ? toDateKey(selectedDate) : undefined,
        dateTo:    rangeEnd ? toDateKey(rangeEnd) : undefined,
        ids:       selected.size > 0 ? [...selected] : undefined,
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintLabels = () => {
    const labels = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o).map(buildAdminLabel);
    void printParcelLabels(labels);
  };

  // ── Bulk set prices/salary (Prices mode quick row) ──────────────────────────
  const handleBulkApply = async () => {
    const price  = bulkPrice  ? parseFloat(bulkPrice)  : null;
    const salary = bulkSalary ? parseFloat(bulkSalary) : null;
    if ((price !== null && (isNaN(price) || price < 0)) || (salary !== null && (isNaN(salary) || salary < 0))) return;
    if (price === null && salary === null) return;
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.flatMap(id => [
        ...(price  !== null ? [setCompanyServicePrice(token, id, price)] : []),
        ...(salary !== null ? [setCourierSalary(token, id, salary)] : []),
      ]));
      const parts = [
        price  !== null ? `${t.aopBulkSvcLabel} ₾${price.toFixed(2)}`  : '',
        salary !== null ? `${t.aopBulkSalLabel} ₾${salary.toFixed(2)}` : '',
      ].filter(Boolean).join(' + ');
      showToast(t.aopBulkApplied(parts, ids.length));
      setShowBulkModal(false); setBulkPrice(''); setBulkSalary('');
      reloadAfterAction();
    } catch (e) {
      showToast(e instanceof Error ? e.message : t.aopBulkFailed, 'err');
    } finally {
      setBulkBusy(false);
    }
  };
  const cancelBulk = () => { setShowBulkModal(false); setBulkPrice(''); setBulkSalary(''); };

  // ── Assign courier ──────────────────────────────────────────────────────────
  const handleBulkAssign = async () => {
    if (!bulkCourierId || selected.size === 0) return;
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts); setPriceChecked(checked); setShowPriceWarning(true); return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts); setSalaryChecked(checked); setShowSalaryWarning(true); return;
    }
    await doAssign();
  };

  const doAssign = async () => {
    setBulkAssigning(true);
    const ids = [...selected].filter(id => { const o = itemById.get(id); return !!o && isAssignable(o); });
    let ok = 0, fail = 0;
    try {
      const result = await bulkAssignCourierToOrders(token, ids, bulkCourierId);
      ok = result.succeeded.length;
      fail = result.failed.length;
    } catch {
      fail = ids.length;
    }
    setBulkAssigning(false); setBulkCourierId('');
    reloadAfterAction();
    showToast(fail === 0 ? t.aopAssignedToast(ok) : t.aopAssignedPartial(ok, fail), fail > 0 ? 'err' : 'ok');
  };

  // ── Mark delivered ──────────────────────────────────────────────────────────
  const handleBulkDeliver = async () => {
    if (actionPool.length === 0) { showToast(t.aopNoDeliverable, 'err'); return; }
    if (missingPriceOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingPriceOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setPriceDrafts(drafts); setPriceChecked(checked); setShowPriceWarning(true); return;
    }
    if (missingSalaryOrders.length > 0) {
      const drafts: Record<string, string> = {}; const checked = new Set<string>();
      missingSalaryOrders.forEach(o => { drafts[o.id] = ''; checked.add(o.id); });
      setSalaryDrafts(drafts); setSalaryChecked(checked); setShowSalaryWarning(true); return;
    }
    if (missingCourierOrders.length > 0 && !bulkCourierId) { showToast(t.aopChooseCourierFirst, 'err'); return; }
    await doDeliver();
  };

  const doDeliver = async () => {
    setBulkDelivering(true);
    const targets = [...selected].map(id => itemById.get(id)).filter((o): o is AdminOrderItem => !!o && isDeliverable(o));
    let ok = 0, fail = 0;
    await Promise.all(targets.map(async o => {
      try {
        await adminMarkOrderDelivered(token, o.id, !o.courierId && bulkCourierId ? { courierId: bulkCourierId } : undefined);
        ok++;
      } catch { fail++; }
    }));
    setBulkDelivering(false); setBulkCourierId('');
    reloadAfterAction();
    showToast(fail === 0 ? t.aopDeliveredToast(ok) : t.aopDeliveredPartial(ok, fail), fail > 0 ? 'err' : 'ok');
  };

  const handleSalarySave = async () => {
    const toSave = [...salaryChecked].filter(id => { const v = parseFloat(salaryDrafts[id] ?? ''); return !isNaN(v) && v >= 0; });
    if (toSave.length === 0) { setShowSalaryModal(false); return; }
    setSalarySaving(true);
    let saved = false;
    // Await the reload so the resume below re-checks gating against fresh orders.
    try { await Promise.all(toSave.map(id => setCourierSalary(token, id, parseFloat(salaryDrafts[id])))); await reload(); saved = true; }
    catch { /* best-effort */ }
    setSalarySaving(false); setShowSalaryModal(false);
    showToast(t.aopSalarySetToast(toSave.length));
    // Resume the action that opened this modal — it commits when nothing is missing or
    // re-prompts otherwise, so the admin never has to click "Assign" a second time.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
  };

  const handlePriceSave = async () => {
    const toSave = [...priceChecked].filter(id => { const v = parseFloat(priceDrafts[id] ?? ''); return !isNaN(v) && v >= 0; });
    if (toSave.length === 0) { setShowPriceModal(false); return; }
    setPriceSaving(true);
    let saved = false;
    try { await Promise.all(toSave.map(id => setCompanyServicePrice(token, id, parseFloat(priceDrafts[id])))); await reload(); saved = true; }
    catch { /* best-effort */ }
    setPriceSaving(false); setShowPriceModal(false);
    showToast(t.aopPriceSetToast(toSave.length));
    // Resume the original action — advances to the salary step (or commits) without a click.
    if (saved) setResumeAction(bulkMode === 'deliver' ? 'deliver' : 'assign');
  };

  // Resume the assign/deliver action after a price/salary save, once no gating dialog is
  // open. Re-running the entry handler re-evaluates the gating against the freshly loaded
  // orders: it commits when nothing is missing, or re-prompts for whatever is still
  // missing (e.g. salary right after prices) — so no second "Assign" click is needed.
  useEffect(() => {
    if (!resumeAction) return;
    if (showSalaryWarning || showSalaryModal || showPriceWarning || showPriceModal) return;
    const action = resumeAction;
    setResumeAction(null);
    if (action === 'deliver') void handleBulkDeliver();
    else void handleBulkAssign();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeAction, showSalaryWarning, showSalaryModal, showPriceWarning, showPriceModal]);

  return {
    selected, setSelected,
    exporting,
    bulkMode, setBulkMode,
    bulkCourierId, setBulkCourierId, bulkAssigning, bulkDelivering,
    showBulkModal, setShowBulkModal, bulkPrice, setBulkPrice, bulkSalary, setBulkSalary, bulkBusy,
    showSalaryWarning, setShowSalaryWarning, showSalaryModal, setShowSalaryModal,
    salaryDrafts, setSalaryDrafts, salaryChecked, setSalaryChecked, salarySaving,
    showPriceWarning, setShowPriceWarning, showPriceModal, setShowPriceModal,
    priceDrafts, setPriceDrafts, priceChecked, setPriceChecked, priceSaving,
    visibleItems, itemById, selectableOrders, allSelected, someSelected, toggleAll, toggleOne,
    rowSelectable, groupSelectableIds, toggleGroupAll, actionPool,
    missingSalaryOrders, missingPriceOrders, missingCourierOrders,
    handleExport, handlePrintLabels, handleBulkApply, cancelBulk,
    handleBulkAssign, handleBulkDeliver, handleSalarySave, handlePriceSave,
  };
}
