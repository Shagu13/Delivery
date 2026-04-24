namespace Domain.Enums
{
    /// <summary>
    /// Unified status enum used by BOTH GroupOrder and Order entities.
    ///
    /// GroupOrder lifecycle:
    ///   Pending → AcceptedGroupOrder → CourierAssignedToPickUp
    ///   → CourierOnTheWayToPickUp → CourierDeliveringToWarehouse
    ///   → DeliveredToWarehouse → AdminAcceptedOrderInWareHouse
    ///   Terminal: CancelledBySender | OrderNotAccepted
    ///
    /// Order lifecycle mirrors GroupOrder through warehouse, then diverges by city:
    ///   Tbilisi:     AdminAcceptedOrderInWareHouse → CourierAssignedToDeliver
    ///   Other city:  AdminAcceptedOrderInWareHouse → OrderIsOnItsWayToRecipientsCity → CourierAssignedToDeliver
    ///   Both paths:  → CourierRecievedOrderToDeliver → OrderIsBeingDeliveredToRecipient → DeliveredToRecipient
    /// </summary>
    public enum OrderStatus
    {
        // ── Shared initial state ────────────────────────────────────────────
        Pending = 0,

        // ── Admin accepts / declines the whole batch ────────────────────────
        AcceptedGroupOrder = 1,   // GroupOrder level
        AcceptedOrder      = 2,   // Order level (mirrors AcceptedGroupOrder)
        OrderNotAccepted   = 3,   // Terminal — admin declined

        // ── Courier assigned to collect from sender ─────────────────────────
        CourierAssignedToPickUp      = 4,
        CourierOnTheWayToPickUp      = 5,
        CourierDeliveringToWarehouse = 6,
        DeliveredToWarehouse         = 7,

        // ── Warehouse acceptance ─────────────────────────────────────────────
        AdminAcceptedOrderInWareHouse = 8,

        // ── Last-mile — other-city path ──────────────────────────────────────
        OrderIsOnItsWayToRecipientsCity = 9,

        // ── Last-mile — assign courier (both paths converge here) ────────────
        CourierAssignedToDeliver          = 10,
        CourierRecievedOrderToDeliver     = 11,
        OrderIsBeingDeliveredToRecipient  = 12,

        // ── Terminal success ─────────────────────────────────────────────────
        DeliveredToRecipient = 13,

        // ── Terminal cancellation ────────────────────────────────────────────
        CancelledBySender = 14,
    }
}
