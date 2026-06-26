using MediatR;

namespace Application.GroupOrders.Commands.AcceptGroupOrderInWarehouse;

/// <summary>
/// Admin confirms the batch arrived in warehouse — GroupOrder → AdminAcceptedOrderInWareHouse.
/// When <paramref name="PresentOrderIds"/> is null every package is accepted (legacy / force
/// path). When supplied, only those packages are accepted; the rest of the batch's still-open
/// packages are cancelled with <see cref="Domain.Enums.CancellationReason.WarehouseNotReceived"/>.
/// </summary>
public sealed record AcceptGroupOrderInWarehouseCommand(
    Guid GroupOrderId,
    IReadOnlyList<Guid>? PresentOrderIds = null) : IRequest;
