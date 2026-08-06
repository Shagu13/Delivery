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

        if (groupOrder.Status != OrderStatus.AcceptedGroupOrder)
            throw new ConflictException($"Only an Accepted group order can be reverted to Pending. Current status: {groupOrder.Status}.");

        groupOrder.Status     = OrderStatus.Pending;
        groupOrder.AcceptedAt = null;

        // Only bounce back the orders the Accept step itself moved — an order an admin
        // separately cancelled in the meantime keeps its own status.
        foreach (var order in groupOrder.Orders.Where(o => o.Status == OrderStatus.AcceptedOrder))
            order.Status = OrderStatus.Pending;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
