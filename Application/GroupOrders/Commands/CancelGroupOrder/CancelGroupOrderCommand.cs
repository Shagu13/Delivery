using MediatR;

namespace Application.GroupOrders.Commands.CancelGroupOrder;

/// <summary>Customer cancels their own pending group order — sets GroupOrder + all Orders → CancelledBySender.</summary>
public sealed record CancelGroupOrderCommand(Guid GroupOrderId, Guid CustomerId) : IRequest;
