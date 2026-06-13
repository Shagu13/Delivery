using Domain.Enums;

namespace Application.Orders.Commands;

/// <summary>
/// Statuses in which a customer may still edit or cancel one of their own
/// Send/Exchange packages — i.e. anything before the parcel is handed to a
/// courier for last-mile delivery. From <see cref="OrderStatus.CourierAssignedToDeliver"/>
/// onward the order is locked to the customer.
/// </summary>
public static class CustomerOrderActionPolicy
{
    public static readonly IReadOnlySet<OrderStatus> EditableOrCancellable = new HashSet<OrderStatus>
    {
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.CourierOnTheWayToPickUp,
        OrderStatus.CourierDeliveringToWarehouse,
        OrderStatus.DeliveredToWarehouse,
        OrderStatus.AdminAcceptedOrderInWareHouse,
        OrderStatus.AcceptedOrder,
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
    };
}
