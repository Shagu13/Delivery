using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AcceptGroupOrderInWarehouse;

public sealed class AcceptGroupOrderInWarehouseCommandHandler
    : IRequestHandler<AcceptGroupOrderInWarehouseCommand>
{
    private readonly IAppDbContext _context;

    public AcceptGroupOrderInWarehouseCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AcceptGroupOrderInWarehouseCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        // Normally reached from DeliveredToWarehouse (courier dropped the batch off),
        // but admins can also force a batch straight to the warehouse from any earlier
        // pickup-flow stage — e.g. the sender brought the packages in themselves and no
        // courier pickup happened. Pricing is set at creation, so skipping the in-between
        // steps only forgoes the pickup timestamps; nothing financial is lost.
        var forceable = new[]
        {
            OrderStatus.Pending,
            OrderStatus.AcceptedGroupOrder,
            OrderStatus.CourierAssignedToPickUp,
            OrderStatus.CourierOnTheWayToPickUp,
            OrderStatus.CourierDeliveringToWarehouse,
            OrderStatus.DeliveredToWarehouse,
        };
        if (!forceable.Contains(groupOrder.Status))
            throw new ConflictException(
                $"Cannot accept in warehouse from status {groupOrder.Status}. " +
                "The batch is already in/past the warehouse or in a terminal status.");

        groupOrder.Status = OrderStatus.AdminAcceptedOrderInWareHouse;

        foreach (var order in groupOrder.Orders)
            order.Status = OrderStatus.AdminAcceptedOrderInWareHouse;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
