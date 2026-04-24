using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AcceptGroupOrder;

public sealed class AcceptGroupOrderCommandHandler : IRequestHandler<AcceptGroupOrderCommand>
{
    private readonly IAppDbContext _context;

    public AcceptGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AcceptGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (groupOrder.Status != OrderStatus.Pending)
            throw new ConflictException($"Only Pending group orders can be accepted. Current status: {groupOrder.Status}.");

        groupOrder.Status     = OrderStatus.AcceptedGroupOrder;
        groupOrder.AcceptedAt = DateTime.UtcNow;

        foreach (var order in groupOrder.Orders)
            order.Status = OrderStatus.AcceptedOrder;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
