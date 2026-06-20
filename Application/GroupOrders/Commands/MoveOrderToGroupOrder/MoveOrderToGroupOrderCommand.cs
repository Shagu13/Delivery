using MediatR;

namespace Application.GroupOrders.Commands.MoveOrderToGroupOrder;

/// <summary>
/// Admin action: moves a single order from its current batch into another batch of the
/// same customer. If the source batch is left with one order, that order is converted
/// back to a standalone order (GroupOrderId → null) and the now-pointless batch and its
/// CustomerSettlement are removed. If left with none, the batch + settlement are removed.
/// Both affected batches' invoices are recomputed.
/// </summary>
public sealed record MoveOrderToGroupOrderCommand(
    Guid OrderId,
    Guid TargetGroupOrderId
) : IRequest;
