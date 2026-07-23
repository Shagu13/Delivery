using Domain.Enums;

namespace Application.Orders.Commands;

/// <summary>
/// Decides whether (re)assigning a courier to a standalone Return order should also move it
/// into that courier's pickup queue.
///
/// The courier's Pickups tab lists a Return only while it sits in CourierAssignedToPickUp or
/// PickedUpFromRecipient (see GetCourierReturnPickupsQueryHandler), so an assignment that
/// leaves the status untouched hands the courier an order they can never see. Anything before
/// the parcel is physically collected must therefore land on CourierAssignedToPickUp — which
/// also repairs a Return that was pushed into batch statuses (AcceptedOrder,
/// AdminAcceptedOrderInWareHouse, …) by the standalone grouping actions.
///
/// Once collected — or cancelled — the status is kept as-is: swapping the courier on a return
/// that already reached the warehouse must not rewind the flow.
/// </summary>
public static class ReturnAssignmentPolicy
{
    private static readonly HashSet<OrderStatus> KeepsItsStatus = new()
    {
        OrderStatus.PickedUpFromRecipient,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    /// <summary>True when assigning a courier should set the return to CourierAssignedToPickUp.</summary>
    public static bool MovesToPickUp(OrderStatus status) => !KeepsItsStatus.Contains(status);
}
