using MediatR;

namespace Application.GroupOrders.Commands.AcceptGroupOrder;

/// <summary>Admin accepts a pending group order — sets GroupOrder → AcceptedGroupOrder, each Order → AcceptedOrder.</summary>
public sealed record AcceptGroupOrderCommand(Guid GroupOrderId) : IRequest;
