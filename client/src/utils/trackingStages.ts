// ── Tracking progress stages ─────────────────────────────────────────────────
// Maps a raw OrderStatus into a small, fixed set of high-level journey stages so
// the public tracker can render a horizontal stepper (Registered → … → Delivered)
// with the reached stages filled and the current one highlighted.
//
// The journey is inferred from the status alone — Return-specific statuses are
// distinct, so no order-type field is needed from the backend.

export type TrackStageKey =
  | 'registered'
  | 'pickedUp'
  | 'atWarehouse'
  | 'outForDelivery'
  | 'delivered'
  | 'returnPickedUp'
  | 'returned';

export interface TrackProgress {
  /** Ordered stage keys for this parcel's journey (forward or return). */
  stageKeys: TrackStageKey[];
  /** Index of the stage the parcel is currently at; -1 when cancelled. */
  activeIndex: number;
  /** True for any cancelled / not-accepted terminal status. */
  cancelled: boolean;
}

const FORWARD_STAGES: TrackStageKey[] = ['registered', 'pickedUp', 'atWarehouse', 'outForDelivery', 'delivered'];
const RETURN_STAGES:  TrackStageKey[] = ['registered', 'returnPickedUp', 'atWarehouse', 'returned'];

const CANCELLED = new Set(['OrderNotAccepted', 'CancelledBySender', 'CancelledByAdmin']);

// Forward (Send / Exchange) status → forward stage index.
const FORWARD_INDEX: Record<string, number> = {
  Pending: 0,
  AcceptedGroupOrder: 0,
  AcceptedOrder: 0,
  CourierAssignedToPickUp: 1,
  CourierOnTheWayToPickUp: 1,
  CourierDeliveringToWarehouse: 1,
  DeliveredToWarehouse: 2,
  AdminAcceptedOrderInWareHouse: 2,
  OrderIsOnItsWayToRecipientsCity: 3,
  CourierAssignedToDeliver: 3,
  CourierDeliveringTheOrderToRecipient: 3,
  DeliveryPostponed: 3,
  DeliveredToRecipient: 4,
  ExchangeCompleted: 4,
  AllDelivered: 4,
};

// Return-only status → return stage index.
const RETURN_INDEX: Record<string, number> = {
  PickedUpFromRecipient: 1,
  DeliveredReturnOrderToWarehouse: 2,
  ReturnedToSender: 3,
};

export function getTrackProgress(status: string): TrackProgress {
  if (CANCELLED.has(status)) {
    return { stageKeys: FORWARD_STAGES, activeIndex: -1, cancelled: true };
  }
  if (status in RETURN_INDEX) {
    return { stageKeys: RETURN_STAGES, activeIndex: RETURN_INDEX[status], cancelled: false };
  }
  return { stageKeys: FORWARD_STAGES, activeIndex: FORWARD_INDEX[status] ?? 0, cancelled: false };
}
