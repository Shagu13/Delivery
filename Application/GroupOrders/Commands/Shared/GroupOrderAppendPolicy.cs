using Domain.Enums;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// A customer may keep adding packages to one of their batches (GroupOrders) only
/// while it is still "open" — before a pickup courier has been assigned. From
/// <see cref="OrderStatus.CourierAssignedToPickUp"/> onward the courier is committed
/// to a known package count, so the batch is closed to further additions.
///
/// Drives both the manual "add package" action (dashboard) and the automatic
/// same-day merge on the create path.
/// </summary>
public static class GroupOrderAppendPolicy
{
    public static readonly IReadOnlySet<OrderStatus> Appendable = new HashSet<OrderStatus>
    {
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
    };
}
