using MediatR;

namespace Application.GroupOrders.Commands.AcceptGroupOrderInWarehouse;

/// <summary>Admin confirms the batch arrived in warehouse — GroupOrder + all Orders → AdminAcceptedOrderInWareHouse.</summary>
public sealed record AcceptGroupOrderInWarehouseCommand(Guid GroupOrderId) : IRequest;
