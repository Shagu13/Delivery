using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.DeclineGroupOrder;

public sealed class DeclineGroupOrderCommandHandler : IRequestHandler<DeclineGroupOrderCommand>
{
    private readonly IAppDbContext _context;

    public DeclineGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeclineGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (groupOrder.Status != OrderStatus.Pending)
            throw new ConflictException($"Only Pending group orders can be declined. Current status: {groupOrder.Status}.");

        groupOrder.Status = OrderStatus.OrderNotAccepted;

        foreach (var order in groupOrder.Orders)
            order.Status = OrderStatus.OrderNotAccepted;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
