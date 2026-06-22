using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.AttachOrdersToGroupOrder;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.GroupAndWarehouseStandaloneOrder;

/// <summary>
/// Admin action for a standalone order (GroupOrderId == null): group it into a batch —
/// the chosen existing batch (<see cref="TargetGroupOrderId"/>) or a new one-order batch
/// when none is chosen — record the pickup courier on that batch, then mark it in the
/// warehouse. A standalone order must never reach the warehouse un-batched, or the
/// pickup-courier trace (GroupOrder.CourierId) would be lost. Returns the batch id.
/// </summary>
public sealed record GroupAndWarehouseStandaloneOrderCommand(
    Guid  OrderId,
    Guid? TargetGroupOrderId = null,
    Guid? CourierId          = null
) : IRequest<Guid>;

public sealed class GroupAndWarehouseStandaloneOrderCommandHandler
    : IRequestHandler<GroupAndWarehouseStandaloneOrderCommand, Guid>
{
    // Pickup-flow statuses a batch can be forced into the warehouse from. Past this it is
    // already in/beyond the warehouse, so we only bring the freshly-added order in line.
    private static readonly OrderStatus[] Forceable =
    {
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.CourierOnTheWayToPickUp,
        OrderStatus.CourierDeliveringToWarehouse,
        OrderStatus.DeliveredToWarehouse,
    };

    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public GroupAndWarehouseStandaloneOrderCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task<Guid> Handle(
        GroupAndWarehouseStandaloneOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.GroupOrderId != null)
            throw new ConflictException("This order is already part of a batch.");
        if (order.CustomerId is not Guid customerId)
            throw new ConflictException("This standalone order has no owning customer to group it under.");

        // 1) Group: into the chosen existing batch, or a new batch when none was picked.
        var grouped = await _sender.Send(
            new AttachOrdersToGroupOrderCommand(
                customerId,
                order.CreatedAt.Date,
                new List<Guid> { order.Id },
                request.TargetGroupOrderId,
                ForceNewBatch: request.TargetGroupOrderId is null),
            cancellationToken);

        var batch = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstAsync(g => g.Id == grouped.GroupOrderId, cancellationToken);

        // 2) Record the pickup courier on the batch when it has none yet — this is the
        //    trace for "who picked up". An existing batch keeps its assigned courier.
        if (batch.CourierId is null)
        {
            if (request.CourierId is not Guid courierId)
                throw new ConflictException("Choose the pickup courier before marking the order in the warehouse.");

            _ = await _context.Couriers.FirstOrDefaultAsync(c => c.Id == courierId, cancellationToken)
                ?? throw new NotFoundException("Courier", courierId);

            batch.CourierId = courierId;
        }

        // 3) Mark in warehouse. If the batch is still in the pickup flow, force the whole
        //    batch in; if it is already in/past the warehouse, only bring this order in line.
        if (Forceable.Contains(batch.Status))
        {
            batch.Status = OrderStatus.AdminAcceptedOrderInWareHouse;
            foreach (var o in batch.Orders)
                o.Status = OrderStatus.AdminAcceptedOrderInWareHouse;
        }
        else
        {
            var moved = batch.Orders.FirstOrDefault(o => o.Id == request.OrderId);
            if (moved is not null)
                moved.Status = OrderStatus.AdminAcceptedOrderInWareHouse;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return batch.Id;
    }
}
