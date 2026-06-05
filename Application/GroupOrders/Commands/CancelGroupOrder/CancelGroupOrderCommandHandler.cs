using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.CancelGroupOrder;

public sealed class CancelGroupOrderCommandHandler : IRequestHandler<CancelGroupOrderCommand>
{
    private readonly IAppDbContext _context;

    public CancelGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(CancelGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        // Ownership check — only the customer who placed it can cancel
        if (groupOrder.CustomerId != request.CustomerId)
            throw new ForbiddenException("You can only cancel your own group orders.");

        // Can only cancel while still Pending
        if (groupOrder.Status != OrderStatus.Pending)
            throw new ConflictException("Only Pending group orders can be cancelled by the sender.");

        groupOrder.Status = OrderStatus.CancelledBySender;

        foreach (var order in groupOrder.Orders)
            order.Status = OrderStatus.CancelledBySender;

        await _context.SaveChangesAsync(cancellationToken);

        // No active orders remain → the batch invoice is soft-deleted by recompute.
        await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);
    }
}
