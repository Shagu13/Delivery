using Domain.Enums;

namespace Application.GroupOrders.Commands.Shared;

/// <summary>
/// Every step of the pickup flow (accept, assign courier, courier confirms pickup, courier
/// delivers to warehouse) mirrors the GroupOrder's new status onto every child Order in one
/// loop. A package the customer or admin already cancelled out-of-band — while the batch was
/// still Pending/Accepted/assigned — must be skipped by that loop, or the mirror resurrects it
/// back into the active flow. This is what let a courier pickup assignment un-cancel an
/// already-cancelled package: the loop had no guard at all.
/// </summary>
public static class PickupFlowOrderMirror
{
    public static readonly IReadOnlySet<OrderStatus> TerminalBeforeWarehouse = new HashSet<OrderStatus>
    {
        OrderStatus.CancelledBySender,
        OrderStatus.CancelledByAdmin,
        OrderStatus.OrderNotAccepted,
    };
}
