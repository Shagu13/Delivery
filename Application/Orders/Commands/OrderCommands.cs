using MediatR;

namespace Application.Orders.Commands;

/// <summary>Admin marks a non-Tbilisi order as dispatched to recipient's city. Order → OrderIsOnItsWayToRecipientsCity.</summary>
public sealed record SendOrderToCityCommand(Guid OrderId) : IRequest;

/// <summary>Admin assigns last-mile delivery courier (Tbilisi orders AND non-Tbilisi after city transit). Order → CourierAssignedToDeliver.</summary>
public sealed record AssignCourierToOrderCommand(Guid OrderId, Guid CourierId) : IRequest;

/// <summary>Courier confirms receipt of order for last-mile delivery. Order → CourierRecievedOrderToDeliver.</summary>
public sealed record MarkOrderReceivedCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Courier starts delivery to recipient. Order → OrderIsBeingDeliveredToRecipient.</summary>
public sealed record MarkOrderDeliveringCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Courier confirms delivery to recipient. Order → DeliveredToRecipient.</summary>
public sealed record MarkOrderDeliveredCommand(Guid OrderId, string CourierUserId) : IRequest;
