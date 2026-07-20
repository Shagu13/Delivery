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
/// Drives every path that puts a package into a batch: the manual "add package" action
/// (dashboard), the cart checkout, the Partner API create path, and the admin
/// attach/merge/move actions. Resolve an open batch through
/// <see cref="OpenBatchResolver"/> rather than re-deriving this rule at a call site —
/// a stale copy of this list on the client is exactly what once blocked customers from
/// adding packages after a courier was assigned.
/// </summary>
public static class GroupOrderAppendPolicy
{
    public static readonly IReadOnlySet<OrderStatus> Appendable = new HashSet<OrderStatus>
    {
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
    };
}
