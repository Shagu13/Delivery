using MediatR;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

/// <summary>Admin assigns a pickup courier — sets GroupOrder + all Orders → CourierAssignedToPickUp.</summary>
public sealed record AssignCourierToGroupOrderCommand(Guid GroupOrderId, Guid CourierId) : IRequest;
