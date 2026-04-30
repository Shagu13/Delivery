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
///   CourierAssignedToDeliver → CourierRecievedOrderToDeliver → DeliveredToRecipient
///   Terminal: CancelledByAdmin
/// </summary>
public enum OrderStatus
{
    // ── Shared / GroupOrder ──────────────────────────────────────────────────
    Pending                         = 0,
    AcceptedGroupOrder              = 1,
    OrderNotAccepted                = 2,
    CourierAssignedToPickUp         = 3,
    CourierOnTheWayToPickUp         = 4,
    CourierDeliveringToWarehouse    = 5,
    DeliveredToWarehouse            = 6,
    AdminAcceptedOrderInWareHouse   = 7,
    CancelledBySender               = 8,

    // ── Order (last-mile) ────────────────────────────────────────────────────
    AcceptedOrder                   = 9,
    OrderIsOnItsWayToRecipientsCity = 10,
    CourierAssignedToDeliver        = 11,
    CourierRecievedOrderToDeliver   = 12,
    DeliveredToRecipient            = 13,

    // ── Admin override (always available) ────────────────────────────────────
    CancelledByAdmin                = 14,
}
