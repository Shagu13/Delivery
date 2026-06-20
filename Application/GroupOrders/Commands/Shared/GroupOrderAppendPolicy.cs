using Domain.Enums;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// A customer may keep adding packages to one of their batches (GroupOrders) only
/// while it is still "open" — up until the courier physically collects it. The first
/// status after pickup is <see cref="OrderStatus.CourierDeliveringToWarehouse"/>
/// (set by the courier's "picked-up" action), at which point the package count is
/// committed and the batch is closed to further additions. Every status before that
/// — including while a courier is assigned and on the way — still accepts packages.
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
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.CourierOnTheWayToPickUp,
    };
}
