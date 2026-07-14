using Domain.Enums;

namespace Application.Orders.Commands;

/// <summary>
/// Statuses in which a customer may still edit or cancel one of their own
/// packages — i.e. anything before the courier has physically picked the parcel up.
/// Pickup (<see cref="OrderStatus.CourierDeliveringToWarehouse"/> for a batch package,
/// <see cref="OrderStatus.PickedUpFromRecipient"/> for a standalone Return) locks the
/// order to the customer: once a courier is holding the parcel it can no longer be
/// edited or cancelled.
/// </summary>
public static class CustomerOrderActionPolicy
{
    public static readonly IReadOnlySet<OrderStatus> EditableOrCancellable = new HashSet<OrderStatus>
    {
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.CourierOnTheWayToPickUp,
    };
}
