using MediatR;

namespace Application.GroupOrders.Commands.CourierGroupOrderActions;

/// <summary>Courier presses "Picked Up" — has collected from sender. GroupOrder + Orders → CourierDeliveringToWarehouse.</summary>
public sealed record MarkPickedUpCommand(Guid GroupOrderId, string CourierUserId) : IRequest;

/// <summary>Courier presses "Delivered to Warehouse". GroupOrder + Orders → DeliveredToWarehouse.</summary>
public sealed record MarkDeliveredToWarehouseCommand(Guid GroupOrderId, string CourierUserId) : IRequest;
