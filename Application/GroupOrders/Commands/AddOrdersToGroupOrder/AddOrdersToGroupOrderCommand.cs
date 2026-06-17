using Application.GroupOrders.DTOs;
using MediatR;

namespace Application.GroupOrders.Commands.AddOrdersToGroupOrder;

/// <summary>
/// Appends one or more Send/Exchange packages to an existing, still-open batch
/// (GroupOrder) owned by the customer. Used by the customer dashboard's "add package"
/// action while the batch has not yet been picked up by a courier.
/// </summary>
public sealed record AddOrdersToGroupOrderCommand(
    Guid GroupOrderId,
    Guid CustomerId,
    IReadOnlyList<CreateOrderDto> Orders
) : IRequest<CreateGroupOrderResultDto>;
