using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.AttachOrdersToGroupOrder;

/// <summary>
/// Admin action: links a customer's unattached (standalone) orders to a pickup batch
/// for a chosen day. When <see cref="TargetGroupOrderId"/> is given the orders join that
/// batch; otherwise an open same-day batch is reused, or a new one is created from the
/// customer's profile pickup details. A matching CustomerSettlement invoice is opened/refreshed.
/// </summary>
public sealed record AttachOrdersToGroupOrderCommand(
    Guid CustomerId,
    DateTime Date,
    IReadOnlyList<Guid> OrderIds,
    Guid? TargetGroupOrderId = null,
    // When true and no target is given, always create a fresh batch instead of reusing
    // the customer's open same-day batch. Lets the admin explicitly choose "new batch".
    bool ForceNewBatch = false
) : IRequest<CreateGroupOrderResultDto>;
