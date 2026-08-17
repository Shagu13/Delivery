// Constants and pure helpers shared by AdminPackagesPage.tsx and its extracted pieces
// (Badges, PackageRow, the pickup-side modals). No JSX, no hooks — just data shaping, so it
// can be imported from anywhere in this folder without pulling React state along with it.
import type { AdminGroupOrder, AdminOrder } from '../../../api/adminGroupOrders';
import { recipientDisplayName } from '../../../utils/recipientName';
import type { ParcelLabelData } from '../../../utils/printLabel';
import type { AdminOrderItem } from '../AdminOrdersPage';

// The backend now matches search as a prefix (StartsWith) per field — fast because it's
// index-backed, but a 1-character prefix is too broad to be a useful filter and would still
// fire a real query on every keystroke.
export const MIN_SEARCH_CHARS = 2;

export const ACTIVE_ORDER_STATUSES_ONLY = new Set([
  'DeliveredToRecipient', 'CancelledBySender', 'CancelledByAdmin',
  'OrderNotAccepted', 'ReturnedToSender', 'ExchangeCompleted',
]);

export const PICKUP_BUCKET: Record<string, number> = {
  Pending: 0, AcceptedGroupOrder: 0,
  CourierAssignedToPickUp: 1, CourierDeliveringToWarehouse: 1,
};
export const pickupBucket = (groupStatus: string) => PICKUP_BUCKET[groupStatus] ?? 2;

export const MERGEABLE_STATUSES = new Set(['Pending', 'AcceptedGroupOrder', 'CourierAssignedToPickUp']);

export const PAGE_SIZE = 30;

export const customerGroupKey = (go: AdminGroupOrder) =>
  `${go.customerId ?? `p:${go.senderPhone}`}|${go.pickUpCity}|${go.pickUpDistrict}|${go.pickUpAddress}`;

export const STATUS_PILLS = [
  { value: '',                                label: 'pillAll' },
  { value: 'Pending',                         label: 'pillPending' },
  { value: 'AcceptedGroupOrder',              label: 'pillAccepted' },
  { value: 'CourierAssignedToPickUp',         label: 'pillCourierPickup' },
  { value: 'CourierDeliveringToWarehouse',    label: 'pillToWarehouse' },
  { value: 'DeliveredToWarehouse',            label: 'pillAtWarehouse' },
  { value: 'AdminAcceptedOrderInWareHouse',   label: 'pillWarehouseAccepted' },
  { value: 'OrderIsOnItsWayToRecipientsCity', label: 'pillSentToCity' },
  { value: 'CourierAssignedToDeliver',        label: 'pillCourierDelivery' },
  { value: 'CourierDeliveringTheOrderToRecipient', label: 'pillCourierReceived' },
] as const;

// ── Delivery-side helpers (copied from AdminOrdersPage.tsx) ───────────────────

export const LAST_MILE_STATUSES = [
  'AdminAcceptedOrderInWareHouse', 'OrderIsOnItsWayToRecipientsCity',
  'CourierAssignedToDeliver', 'CourierDeliveringTheOrderToRecipient', 'DeliveryPostponed',
];

export function isAssignable(o: AdminOrderItem): boolean {
  return o.status === 'AdminAcceptedOrderInWareHouse'
      || o.status === 'OrderIsOnItsWayToRecipientsCity'
      || o.status === 'CourierAssignedToDeliver'
      || o.status === 'CourierDeliveringTheOrderToRecipient'
      || o.status === 'DeliveryPostponed'
      || (o.orderType === 'Return' && (o.status === 'Pending' || o.status === 'CourierAssignedToPickUp'));
}

export function isDeliverable(o: AdminOrderItem): boolean {
  return o.orderType !== 'Return' && LAST_MILE_STATUSES.includes(o.status);
}

export function recipientAmountDue(o: { productPaymentStatus: string; amountToCollectForPackage: number | null; whoPaysForCompanyService: string; companyServicePrice: number }): number {
  const cod = o.productPaymentStatus === 'NotPaid' ? (o.amountToCollectForPackage ?? 0) : 0;
  const fee = o.whoPaysForCompanyService === 'Recipient' ? (o.companyServicePrice ?? 0) : 0;
  return cod + fee;
}

// A Return order is picked up from `returnPickup*` (entered explicitly when the return
// was created) — not the "recipient" fields, which for Return orders hold the business's
// own address (where the item is ultimately returned to), not where the courier actually
// goes to collect it. No geo variant exists for return-pickup fields (plain text entry),
// unlike recipient city/district. Structural type so it works for both AdminOrderItem and
// AdminOrder (the pickup-customer-grid modals use the latter).
export interface PickupLocationFields {
  orderType: string;
  recipientCity: string;
  recipientCityGeo?: string;
  recipientDistrict: string;
  recipientDistrictGeo?: string;
  recipientAddress: string;
  returnPickupCity?: string | null;
  returnPickupDistrict?: string | null;
  returnPickupAddress?: string | null;
}
export function pickupCityDisplay(o: PickupLocationFields, lang: string): string {
  if (o.orderType === 'Return' && o.returnPickupCity) return o.returnPickupCity;
  return lang === 'ka' && o.recipientCityGeo ? o.recipientCityGeo : o.recipientCity;
}
export function pickupDistrictDisplay(o: PickupLocationFields, lang: string): string {
  if (o.orderType === 'Return' && o.returnPickupCity) return o.returnPickupDistrict ?? '';
  return lang === 'ka' && o.recipientDistrictGeo ? o.recipientDistrictGeo : o.recipientDistrict;
}
export function pickupAddressDisplay(o: PickupLocationFields): string {
  return o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupAddress ?? '') : o.recipientAddress;
}

export function buildAdminLabel(o: AdminOrderItem): ParcelLabelData {
  const due = recipientAmountDue(o);
  const city     = o.orderType === 'Return' && o.returnPickupCity ? o.returnPickupCity     : (o.recipientCityGeo     || o.recipientCity);
  const district = o.orderType === 'Return' && o.returnPickupCity ? (o.returnPickupDistrict ?? '') : (o.recipientDistrictGeo || o.recipientDistrict);
  const address  = pickupAddressDisplay(o);
  return {
    storeName:        o.senderBusinessName,
    recipientName:    recipientDisplayName(o.recipientName, 'უცნობი'),
    recipientPhone:   o.recipientPhone,
    recipientAddress: [city, district, address].filter(Boolean).join(', '),
    amountText:       due > 0.005 ? `₾${due.toFixed(2)}` : 'გადახდილია',
    description:      o.description ?? undefined,
    trackingNumber:   o.trackingNumber,
  };
}

export function fmtDateTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Map a group order's package + its parent into the AdminOrderItem shape the delivery
// modals/actions expect. `courierFullName` is resolved from the couriers roster.
export function toOrderItem(o: AdminOrder, go: AdminGroupOrder, courierName: string | null): AdminOrderItem {
  return {
    id: o.id,
    trackingNumber: o.trackingNumber,
    senderBusinessName: go.senderBusinessName,
    senderFirstName: go.senderFirstName,
    senderLastName: go.senderLastName,
    senderPhone: go.senderPhone,
    alternativeSenderPhone: go.alternativeSenderPhone ?? null,
    groupOrderId: go.id,
    pickUpCity: go.pickUpCity,
    pickUpDistrict: go.pickUpDistrict,
    pickUpAddress: go.pickUpAddress,
    recipientName: o.recipientName,
    recipientPhone: o.recipientPhone,
    recipientCity: o.recipientCity,
    recipientCityGeo: o.recipientCityGeo,
    recipientDistrict: o.recipientDistrict,
    recipientDistrictGeo: o.recipientDistrictGeo,
    recipientAddress: o.recipientAddress,
    description: o.description,
    isFragile: o.isFragile,
    orderType: o.orderType,
    status: o.status,
    productPaymentStatus: o.productPaymentStatus,
    whoPaysForCompanyService: o.whoPaysForCompanyService,
    companyServicePrice: o.companyServicePrice,
    isCompanyServicePriceIncluded: o.isCompanyServicePriceIncluded,
    courierSalary: o.courierSalary,
    companyRevenue: o.companyRevenue,
    amountToCollectForPackage: o.amountToCollectForPackage,
    returnPickupCity: o.returnPickupCity ?? null,
    returnPickupDistrict: o.returnPickupDistrict ?? null,
    returnPickupAddress: o.returnPickupAddress ?? null,
    courierId: o.courierId,
    courierFullName: o.courierId ? courierName : null,
    createdAt: o.createdAt,
    deliveredAt: o.deliveredAt,
    postponeReason: null,
    postponeComment: null,
  };
}
