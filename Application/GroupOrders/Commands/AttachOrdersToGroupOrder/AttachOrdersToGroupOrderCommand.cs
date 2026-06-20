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
    Guid? TargetGroupOrderId = null
) : IRequest<CreateGroupOrderResultDto>;
