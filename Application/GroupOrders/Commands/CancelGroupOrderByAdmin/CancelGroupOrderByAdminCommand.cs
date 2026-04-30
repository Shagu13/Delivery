using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.CancelGroupOrderByAdmin;

public sealed record CancelGroupOrderByAdminCommand(Guid GroupOrderId) : IRequest;

public sealed class CancelGroupOrderByAdminCommandHandler
    : IRequestHandler<CancelGroupOrderByAdminCommand>
{
    private readonly IAppDbContext _context;
    public CancelGroupOrderByAdminCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(CancelGroupOrderByAdminCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (groupOrder.Status == OrderStatus.CancelledByAdmin)
            throw new ConflictException("Group order is already cancelled by admin.");

        // Cancel the group order itself
        groupOrder.Status = OrderStatus.CancelledByAdmin;

        // Also cancel all child orders that haven't been delivered yet
        foreach (var order in groupOrder.Orders)
        {
            if (order.Status != OrderStatus.DeliveredToRecipient &&
                order.Status != OrderStatus.CancelledByAdmin &&
                order.Status != OrderStatus.CancelledBySender)
            {
                order.Status = OrderStatus.CancelledByAdmin;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
