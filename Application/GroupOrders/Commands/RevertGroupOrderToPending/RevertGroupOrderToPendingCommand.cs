using MediatR;

namespace Application.GroupOrders.Commands.RevertGroupOrderToPending;

/// <summary>Admin undoes an accidental Accept — sets GroupOrder → Pending, each still-AcceptedOrder Order → Pending.</summary>
public sealed record RevertGroupOrderToPendingCommand(Guid GroupOrderId) : IRequest;
