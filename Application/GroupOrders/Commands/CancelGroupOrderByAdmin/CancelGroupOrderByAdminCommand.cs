using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.CancelGroupOrderByAdmin;

public sealed record CancelGroupOrderByAdminCommand(Guid GroupOrderId) : IRequest;

public sealed class CancelGroupOrderByAdminCommandHandler
    : IRequestHandler<CancelGroupOrderByAdminCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public CancelGroupOrderByAdminCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

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

        // Couriers whose active lists must drop these orders once cancelled.
        var affectedCourierIds = new HashSet<Guid>();
        if (groupOrder.CourierId is Guid groupCourier) affectedCourierIds.Add(groupCourier);

        // Also cancel all child orders that haven't been delivered yet
        foreach (var order in groupOrder.Orders)
        {
            if (order.Status != OrderStatus.DeliveredToRecipient &&
                order.Status != OrderStatus.CancelledByAdmin &&
                order.Status != OrderStatus.CancelledBySender)
            {
                if (order.CourierId is Guid orderCourier) affectedCourierIds.Add(orderCourier);
                order.Status = OrderStatus.CancelledByAdmin;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Recompute the batch invoice (keeps any delivered orders; soft-deletes if
        // none remain active).
        await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);

        // Live-refresh every affected courier's dashboard and the admins.
        foreach (var courierId in affectedCourierIds)
            _notifier.NotifyCourierOrdersChanged(courierId);
        _notifier.NotifyAdminsOrdersChanged();
    }
}
