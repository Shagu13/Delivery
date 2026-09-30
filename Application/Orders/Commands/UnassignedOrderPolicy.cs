using Domain.Enums;

namespace Application.Orders.Commands;

/// <summary>
/// Which parcels may still be handed a *first* delivery courier: a Send/Exchange order waiting in
/// the warehouse (or for its city leg) with nobody assigned. Shared by the Scan screen's lookup
/// (admin Assign mode and the courier self-claim) and <see cref="CourierClaimOrdersCommand"/>, so
/// the rule cannot drift between them. Mirrors the first-assignment statuses that
/// <see cref="BulkAssignCourierToOrdersCommandHandler"/> accepts.
/// </summary>
public static class UnassignedOrderPolicy
{
    public static readonly OrderStatus[] AwaitingAssignment =
    {
        OrderStatus.AdminAcceptedOrderInWareHouse,
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
    };

    /// <summary>
    /// Null when the parcel is claimable, otherwise why it isn't. <paramref name="currentCourierName"/>
    /// names the holder in the message; leave it null to keep the other courier anonymous.
    /// </summary>
    public static string? Rejection(Domain.Order order, string? currentCourierName = null)
    {
        string tracking = order.TrackingNumber;

        if (order.OrderType == OrderType.Return)
            return $"{tracking} is a return order — it cannot be assigned here.";

        if (order.CourierId is not null)
            return currentCourierName is null
                ? $"{tracking} is already assigned to a courier."
                : $"{tracking} is already assigned to {currentCourierName}.";

        if (order.Status == OrderStatus.DeliveredToWarehouse)
            return $"{tracking} has not been accepted in the warehouse yet — accept it first.";

        if (!AwaitingAssignment.Contains(order.Status))
            return $"{tracking} is not waiting for a courier (status: {order.Status}).";

        return null;
    }
}
