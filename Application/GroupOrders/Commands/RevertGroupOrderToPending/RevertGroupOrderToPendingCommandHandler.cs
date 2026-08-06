using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.RevertGroupOrderToPending;

public sealed class RevertGroupOrderToPendingCommandHandler : IRequestHandler<RevertGroupOrderToPendingCommand>
{
    private readonly IAppDbContext _context;

    public RevertGroupOrderToPendingCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(RevertGroupOrderToPendingCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        var revertibleStatuses = new[]
        {
            OrderStatus.AcceptedGroupOrder,
            OrderStatus.AdminAcceptedOrderInWareHouse,
        };
        if (!revertibleStatuses.Contains(groupOrder.Status))
            throw new ConflictException($"Only an Accepted or warehouse-accepted group order can be reverted to Pending. Current status: {groupOrder.Status}.");

        // Orders still sitting at the stage the batch-level step itself put them in are the
        // ones to bounce back. An order an admin separately cancelled, or one that already
        // moved on into its own last-mile flow, keeps its own status untouched.
        // AcceptedGroupOrder mirrors onto Orders as the differently-named AcceptedOrder;
        // every later shared stage (incl. AdminAcceptedOrderInWareHouse) uses the same name.
        var orderStageStatus = groupOrder.Status == OrderStatus.AcceptedGroupOrder
            ? OrderStatus.AcceptedOrder
            : groupOrder.Status;
        foreach (var order in groupOrder.Orders.Where(o => o.Status == orderStageStatus))
            order.Status = OrderStatus.Pending;

        if (groupOrder.Status == OrderStatus.AdminAcceptedOrderInWareHouse)
        {
            // Undoes the pickup courier's whole run, not just the warehouse-accept step —
            // the batch goes back to square one.
            groupOrder.CourierId              = null;
            groupOrder.PickedUpAt             = null;
            groupOrder.DeliveredToWarehouseAt = null;
        }

        groupOrder.Status     = OrderStatus.Pending;
        groupOrder.AcceptedAt = null;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
