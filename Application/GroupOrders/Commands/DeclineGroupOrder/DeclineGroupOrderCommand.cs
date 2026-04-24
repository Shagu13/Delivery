using MediatR;

namespace Application.GroupOrders.Commands.DeclineGroupOrder;

/// <summary>Admin declines a pending group order — sets GroupOrder + all Orders → OrderNotAccepted.</summary>
public sealed record DeclineGroupOrderCommand(Guid GroupOrderId) : IRequest;
