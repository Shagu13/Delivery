namespace Domain.Enums;

/// <summary>
/// Unified status enum shared by both GroupOrder and Order entities.
///
/// GroupOrder path:
///   Pending → AcceptedGroupOrder → CourierAssignedToPickUp → CourierOnTheWayToPickUp
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
/// Return flow (OrderType == Return):
///   Same GroupOrder pickup flow → warehouse → CourierAssignedToDeliver (to sender's address)
///   → CourierDeliveringTheOrderToRecipient → ReturnedToSender (terminal)
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
    CourierOnTheWayToPickUp              = 4,
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
}
