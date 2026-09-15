namespace Domain.Enums;

/// <summary>
/// Unified status enum shared by both GroupOrder and Order entities.
///
/// GroupOrder path:
///   Pending → AcceptedGroupOrder → CourierAssignedToPickUp
///   → CourierDeliveringToWarehouse → DeliveredToWarehouse → AdminAcceptedOrderInWareHouse
///   → (each Order below gets its own last-mile flow)
///   Terminal: CancelledBySender | OrderNotAccepted | CancelledByAdmin
///
/// Order (last-mile) path:
///   AdminAcceptedOrderInWareHouse → [non-Tbilisi: OrderIsOnItsWayToRecipientsCity →]
///   CourierAssignedToDeliver → CourierDeliveringTheOrderToRecipient
///   → DeliveredToRecipient  |  DeliveryPostponed → CourierDeliveringTheOrderToRecipient (retry)
///   Terminal: CancelledByAdmin
///
/// Return flow (OrderType == Return, standalone order):
///   Created (Pending) → CourierAssignedToPickUp
///   → PickedUpFromRecipient (courier has parcel from recipient's address)
///   → DeliveredReturnOrderToWarehouse (courier dropped at warehouse)
///   → ReturnedToSender (terminal, set by admin once sent back)
///
/// Exchange flow (OrderType == Exchange):
///   Same as standard Send flow → ExchangeCompleted (terminal, set by admin)
/// </summary>
public enum OrderStatus
{
    // ── Shared / GroupOrder ──────────────────────────────────────────────────
    Pending                              = 0,
    AcceptedGroupOrder                   = 1,
    OrderNotAccepted                     = 2,
    CourierAssignedToPickUp              = 3,

    CourierDeliveringToWarehouse         = 5,
    DeliveredToWarehouse                 = 6,
    AdminAcceptedOrderInWareHouse        = 7,
    CancelledBySender                    = 8,

    // ── Order (last-mile) ────────────────────────────────────────────────────
    AcceptedOrder                        = 9,
    OrderIsOnItsWayToRecipientsCity      = 10,
    CourierAssignedToDeliver             = 11,
    CourierDeliveringTheOrderToRecipient = 12,
    DeliveredToRecipient                 = 13,

    // ── Admin override (always available) ────────────────────────────────────
    CancelledByAdmin                     = 14,

    // ── Delivery postponed by courier ────────────────────────────────────────
    DeliveryPostponed                    = 15,

    // ── GroupOrder terminal: every package delivered or cancelled ─────────────
    AllDelivered                         = 16,

    // ── Return terminal ───────────────────────────────────────────────────────
    /// <summary>
    /// The returned parcel has been delivered back to the sender.
    /// Set by admin. Visible on customer dashboard.
    /// </summary>
    ReturnedToSender                     = 17,

    // ── Exchange terminal ─────────────────────────────────────────────────────
    /// <summary>
    /// The exchange parcel has been delivered to the recipient.
    /// Set by admin. Visible on customer dashboard.
    /// </summary>
    ExchangeCompleted                    = 18,

    // ── Return-order courier flow ─────────────────────────────────────────────

    /// <summary>
    /// Courier has physically collected the parcel from the recipient's address.
    /// Applies to standalone Return orders only.
    /// </summary>
    PickedUpFromRecipient                = 19,

    /// <summary>
    /// Courier has delivered the Return parcel to the warehouse.
    /// Admin reviews and eventually marks ReturnedToSender.
    /// </summary>
    DeliveredReturnOrderToWarehouse      = 20,
}
