using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands;

/// <summary>Admin assigns a courier to a standalone Return order for pickup from recipient.</summary>
public sealed record AssignCourierToReturnOrderCommand(Guid OrderId, Guid CourierId) : IRequest;

/// <summary>Courier confirms they have picked up the parcel from the recipient's address.</summary>
public sealed record MarkReturnPickedUpCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Courier confirms they have delivered the Return parcel to the warehouse.</summary>
public sealed record MarkReturnDeliveredToWarehouseCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Admin marks a Return order as returned to the sender (terminal state).</summary>
public sealed record MarkReturnedToSenderCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin/Operator override: force a standalone Return order to any status in its flow
/// (incl. correcting a step a courier skipped, or moving it backward to fix a mistake).
/// The relevant "reached" timestamp is stamped when moving forward into a milestone.
/// </summary>
public sealed record AdminSetReturnOrderStatusCommand(Guid OrderId, OrderStatus NewStatus) : IRequest;
