using MediatR;

namespace Application.GroupOrders.Commands.RevertGroupOrderToPending;

/// <summary>
/// Admin undoes an accidental Accept or an accidental warehouse-accept — sets GroupOrder →
/// Pending, and bounces back each Order still at that same stage. Reverting from
/// AdminAcceptedOrderInWareHouse also clears the pickup courier, pickup date, and
/// warehouse-accepted date.
/// </summary>
public sealed record RevertGroupOrderToPendingCommand(Guid GroupOrderId) : IRequest;
