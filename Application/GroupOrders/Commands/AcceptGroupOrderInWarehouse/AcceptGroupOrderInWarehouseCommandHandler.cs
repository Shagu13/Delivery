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

        if (groupOrder.Status != OrderStatus.DeliveredToWarehouse)
            throw new ConflictException($"Expected DeliveredToWarehouse. Current: {groupOrder.Status}.");

        groupOrder.Status = OrderStatus.AdminAcceptedOrderInWareHouse;

        foreach (var order in groupOrder.Orders)
            order.Status = OrderStatus.AdminAcceptedOrderInWareHouse;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
