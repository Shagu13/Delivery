using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.MoveOrderToGroupOrder;

public sealed class MoveOrderToGroupOrderCommandHandler
    : IRequestHandler<MoveOrderToGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;

    public MoveOrderToGroupOrderCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task Handle(MoveOrderToGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.GroupOrderId is not Guid sourceId)
            throw new ConflictException("This order is not part of a batch.");

        if (sourceId == request.TargetGroupOrderId)
            throw new ConflictException("The order is already in that batch.");

        var source = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstAsync(g => g.Id == sourceId, cancellationToken);

        var target = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == request.TargetGroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.TargetGroupOrderId);

        if (source.CustomerId != target.CustomerId)
            throw new ConflictException("Orders can only be moved between the same customer's batches.");
        if (!GroupOrderAppendPolicy.Appendable.Contains(source.Status))
            throw new ConflictException("The source batch has already been picked up.");
        if (!GroupOrderAppendPolicy.Appendable.Contains(target.Status))
            throw new ConflictException("The target batch has already been picked up.");

        // ── Move the order onto the target ────────────────────────────────────────
        order.GroupOrderId = target.Id;
        order.CustomerId   = null;            // the batch owns the customer link
        source.Orders.Remove(order);
        target.Orders.Add(order);
        target.NumberOfPackages++;
        source.NumberOfPackages = Math.Max(0, source.NumberOfPackages - 1);

        var remaining = source.Orders.ToList();

        if (remaining.Count <= 1)
        {
            // A one-order "batch" is pointless: turn the last order back into a standalone
            // order owned directly by the customer, and drop the batch entirely.
            if (remaining.Count == 1)
            {
                var last = remaining[0];
                last.GroupOrderId = null;
                last.CustomerId   = source.CustomerId;
                source.Orders.Remove(last);   // detach so deleting the batch can't cascade it
            }

            _context.GroupOrders.Remove(source);
        }

        await _context.SaveChangesAsync(cancellationToken);

        _notifier.NotifyAdminsOrdersChanged();
    }
}
