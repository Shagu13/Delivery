// One package row + its matching <thead>, shared by the accordion and flat (recipient-search)
// views of the Packages page. Presentational — all data and mutation callbacks come in as
// props; the only thing this file owns is the row's own markup.
import { useLanguage } from '../../../contexts/useLanguage';
import { recipientDisplayName } from '../../../utils/recipientName';
import { printParcelLabels } from '../../../utils/printLabel';
import { PhoneActions } from '../../../components/ui/PhoneActions';
import type { AdminGroupOrder, AdminOrder } from '../../../api/adminGroupOrders';
import type { Courier } from '../../../api/couriers';
import { AdminOrderRowActions } from '../AdminGroupOrderActions';
import { OrderRowActionsMenu } from '../OrderRowActionsMenu';
import type { AdminOrderItem } from '../AdminOrdersPage';
import {
  pickupCityDisplay, pickupDistrictDisplay, pickupAddressDisplay, fmtDateTime,
  isAssignable, isDeliverable, buildAdminLabel, toOrderItem,
} from './shared';
import { StatusBadge, OrderTypeBadge } from './Badges';
import { MoveOrderControl } from './MoveOrderControl';

export function PackageRow({
  o, go, moveDestinations, warehouseSelectable = false, showStore = false,
  canManage, canGroup, selected, toggleOne, rowSelectable, courierNameById,
  showTracking, absentPkgs, togglePkgPresent, showPricesEff, showRevenueEff,
  couriers, token, setViewingOrder, openEditOrder, reload, reloadAll, showToast, patchOrder,
}: {
  o: AdminOrder; go: AdminGroupOrder; moveDestinations: AdminGroupOrder[];
  warehouseSelectable?: boolean; showStore?: boolean;
  canManage: boolean; canGroup: boolean;
  selected: Set<string>; toggleOne: (id: string) => void;
  rowSelectable: (o: AdminOrderItem) => boolean;
  courierNameById: Map<string, string>;
  showTracking: boolean; absentPkgs: Set<string>; togglePkgPresent: (id: string) => void;
  showPricesEff: boolean; showRevenueEff: boolean;
  couriers: Courier[]; token: string;
  setViewingOrder: (item: AdminOrderItem) => void;
  openEditOrder: (o: AdminOrder, go: AdminGroupOrder) => void;
  reload: () => void; reloadAll: () => void;
  showToast: (msg: string, type?: 'ok' | 'err') => void;
  /** Patches this order directly in the cached Packages list — see AdminPackagesPage's
   *  patchPackageOrder. Used for the instant post-assign row update (onAssigned below). */
  patchOrder: (orderId: string, patch: (o: AdminOrder) => AdminOrder) => void;
}) {
  const { t, lang } = useLanguage();
  const selectable = canManage && rowSelectable(toOrderItem(o, go, null));
  const isChecked = selected.has(o.id);
  const courierName = o.courierId ? (courierNameById.get(o.courierId) ?? null) : null;
  const menuItem = toOrderItem(o, go, courierName);
  return (
    <tr key={o.id} className={isChecked ? 'pkg-row--selected' : ''}>
      {canManage && (
        <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <input type="checkbox" className="aop-checkbox" checked={isChecked} disabled={!selectable}
            onChange={() => selectable && toggleOne(o.id)} />
        </td>
      )}
      {showTracking && (
        <td>
          <span className="tn-badge">{o.trackingNumber}</span>
          {warehouseSelectable && canManage && o.status === 'DeliveredToWarehouse' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: '0.7rem', color: 'var(--color-text-subtle)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" style={{ cursor: 'pointer' }}
                checked={!absentPkgs.has(o.id)}
                onChange={() => togglePkgPresent(o.id)} />
              {t.goWarehousePresent}
            </label>
          )}
        </td>
      )}
      {showStore && (
        <td>
          <div style={{ fontWeight: 600 }}>{go.senderBusinessName || '—'}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-subtle)' }}>{go.senderFirstName} {go.senderLastName}</div>
        </td>
      )}
      <td>
        <div style={{ fontWeight: 600 }}>{recipientDisplayName(o.recipientName, t.recipientUnknown)}</div>
        <PhoneActions phone={o.recipientPhone} />
      </td>
      <td>
        <div>{pickupCityDisplay(o, lang)}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{pickupDistrictDisplay(o, lang)}</div>
      </td>
      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 180 }}>{pickupAddressDisplay(o)}</td>
      <td style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)', maxWidth: 160 }}>{o.description ?? <span style={{ opacity: 0.4 }}>—</span>}</td>
      <td>
        <StatusBadge status={o.status} />
        <div style={{ marginTop: 4 }}>
          <OrderTypeBadge orderType={o.orderType} />
        </div>
        {/* Delivery-courier / assignment indicator (from the Delivery page). */}
        <div className="aop-courier-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={courierName ?? t.vomUnassigned}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M3 8.5l3.5 3.5L13 5" stroke={o.courierId ? '#10b981' : '#ef4444'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={o.courierId ? undefined : { color: '#ef4444' }}>{courierName ?? t.vomUnassigned}</span>
        </div>
        {o.deliveredAt && (
          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-subtle)', marginTop: 2 }}>
            {t.aopDeliveredAt} · {fmtDateTime(o.deliveredAt, lang)}
          </div>
        )}
      </td>
      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {(() => {
          // What the courier actually collects from the recipient: the product COD
          // (only when unpaid) plus the company service fee (only when the recipient
          // pays it). Shown stacked — COD, + fee, = total — when both parts apply.
          const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
          const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
          const total = cod + fee;
          if (total <= 0) return <span style={{ opacity: 0.4 }}>—</span>;
          // Only break the figure apart when both a product COD and a recipient-paid
          // fee are collected; a single component is just shown as its own amount.
          // Operators (no canManage) must not see the service fee — they get the total only.
          if (!canManage || !(cod > 0 && fee > 0)) return <span>₾{total.toFixed(2)}</span>;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3, alignItems: 'flex-start' }}>
              <span>{t.goCodLbl} ₾{cod.toFixed(2)}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--color-text-subtle)' }}>{t.goFeeLbl} ₾{fee.toFixed(2)}</span>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, borderTop: '1px solid var(--color-border)', paddingTop: 1, marginTop: 1 }}>{t.goTotalLbl} ₾{total.toFixed(2)}</span>
            </div>
          );
        })()}
      </td>
      {showPricesEff && (
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {!o.companyServicePrice ? <span className="aop-missing">{t.aopNotSet}</span> : <span className="aop-price">₾{o.companyServicePrice.toFixed(2)}</span>}
        </td>
      )}
      {showPricesEff && (
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {o.courierSalary == null ? <span className="aop-missing">{t.aopNotSet}</span> : <span className="aop-price">₾{o.courierSalary.toFixed(2)}</span>}
        </td>
      )}
      {showRevenueEff && (
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          {o.companyRevenue != null ? <span className="aop-price">₾{o.companyRevenue.toFixed(2)}</span> : <span style={{ opacity: 0.4 }}>—</span>}
        </td>
      )}
      <td>
        {o.productPaymentStatus === 'Paid' ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#10b981' }}>{t.goPaid}</span>
        ) : (() => {
          const courierDue = o.whoPaysForCompanyService === 'Recipient' && o.companyServicePrice > 0;
          const sub = o.productPaymentStatus === 'NotPaid' && courierDue ? t.goSubParcelAndFee : courierDue ? t.goSubFeeOnly : t.goSubParcelOnly;
          return (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444' }}>{t.goUnpaid}</span>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#ef4444', opacity: 0.8 }}>{sub}</span>
            </span>
          );
        })()}
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <OrderRowActionsMenu
            order={menuItem}
            couriers={couriers}
            token={token}
            canManage={canManage}
            canAssign={isAssignable(menuItem)}
            canDeliver={isDeliverable(menuItem)}
            onView={() => setViewingOrder(menuItem)}
            onEdit={() => openEditOrder(o, go)}
            onLabel={() => void printParcelLabels([buildAdminLabel(menuItem)])}
            onChanged={() => reload()}
            onAssigned={(courierId, newStatus) => {
              // Mirrors AdminOrdersPage's doAssign optimistic patch — instant row update
              // instead of waiting on reload()'s full list refetch for a single-row assign.
              const assignedCourier = couriers.find(c => c.courierId === courierId);
              const defaultSalary = assignedCourier?.defaultSalary ?? null;
              patchOrder(o.id, ord => ({
                ...ord,
                courierId,
                status: newStatus as AdminOrder['status'],
                ...(ord.orderType !== 'Return' && defaultSalary != null
                  ? { courierSalary: defaultSalary, companyRevenue: ord.companyServicePrice - defaultSalary }
                  : {}),
              }));
            }}
            onError={msg => showToast(msg, 'err')}
          />
          {/* Edit + Label now live in the kebab menu above; this keeps the pickup-only
              actions (send-to-city, cancel). */}
          <AdminOrderRowActions order={o} storeName={go.senderBusinessName} couriers={couriers} token={token}
            onSuccess={msg => showToast(msg)} onError={msg => showToast(msg, 'err')}
            onRefresh={() => reload()}
            canManage={canManage}
            showLabel={false} />
          {canGroup && moveDestinations.length > 0 && (
            <MoveOrderControl orderId={o.id} destinations={moveDestinations} token={token}
              onMoved={() => { reloadAll(); showToast(t.pickupMovedToast); }}
              onError={msg => showToast(msg, 'err')} />
          )}
        </div>
      </td>
    </tr>
  );
}

// `selectAllGo === 'global'` is used by the flat (Recipient + city/district) view, which
// spans many customer batches at once — there's no single group to scope a checkbox to,
// so it drives the page-wide select-all instead of the per-batch one.
export function PackageTableHead({
  showStore = false, selectAllGo, canManage, allSelected, someSelected, hasSelectableOrders,
  toggleAll, groupSelectableIds, selected, toggleGroupAll, showTracking, showPricesEff, showRevenueEff,
}: {
  showStore?: boolean; selectAllGo?: AdminGroupOrder | 'global';
  canManage: boolean; allSelected: boolean; someSelected: boolean; hasSelectableOrders: boolean;
  toggleAll: () => void; groupSelectableIds: (go: AdminGroupOrder) => string[];
  selected: Set<string>; toggleGroupAll: (go: AdminGroupOrder) => void;
  showTracking: boolean; showPricesEff: boolean; showRevenueEff: boolean;
}) {
  const { t } = useLanguage();
  return (
    <thead>
      <tr>
        {canManage && (
          <th style={{ width: 36 }}>
            {selectAllGo === 'global' ? (
              <input type="checkbox" className="aop-checkbox" checked={allSelected} disabled={!hasSelectableOrders}
                ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleAll} />
            ) : selectAllGo && (() => {
              const ids = groupSelectableIds(selectAllGo);
              const allIn  = ids.length > 0 && ids.every(id => selected.has(id));
              const someIn = ids.some(id => selected.has(id));
              return (
                <input type="checkbox" className="aop-checkbox" checked={allIn} disabled={ids.length === 0}
                  ref={el => { if (el) el.indeterminate = someIn && !allIn; }}
                  onChange={() => toggleGroupAll(selectAllGo)} />
              );
            })()}
          </th>
        )}
        {showTracking && <th>{t.goThTracking}</th>}
        {showStore && <th>{t.goSender}</th>}
        <th>{t.goThRecipient}</th>
        <th>{t.goThCityDistrict}</th>
        <th>{t.goThAddress}</th>
        <th>{t.goThDescription}</th>
        <th>{t.goThStatus}</th>
        <th>{t.goThCollect}</th>
        {showPricesEff && <th style={{ textAlign: 'right' }}>{t.aopThSvcPrice}</th>}
        {showPricesEff && <th style={{ textAlign: 'right' }}>{t.aopThSalary}</th>}
        {showRevenueEff && <th style={{ textAlign: 'right' }}>{t.aopThRevenue}</th>}
        <th>{t.goThPaid}</th>
        <th>{t.goThActions}</th>
      </tr>
    </thead>
  );
}
