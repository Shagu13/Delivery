using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.MergeGroupOrders;

public sealed class MergeGroupOrdersCommandHandler
    : IRequestHandler<MergeGroupOrdersCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;

    public MergeGroupOrdersCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        MergeGroupOrdersCommand request,
        CancellationToken cancellationToken)
    {
        var sourceIds = request.SourceGroupOrderIds.Where(id => id != request.TargetGroupOrderId).Distinct().ToList();
        if (sourceIds.Count == 0)
            throw new ConflictException("Select at least one batch to merge into the target.");

        var allIds = new List<Guid>(sourceIds) { request.TargetGroupOrderId };

        var batches = await _context.GroupOrders
            .Include(g => g.Orders)
            .Where(g => allIds.Contains(g.Id))
            .ToListAsync(cancellationToken);

        var target = batches.FirstOrDefault(g => g.Id == request.TargetGroupOrderId)
            ?? throw new NotFoundException("GroupOrder", request.TargetGroupOrderId);

        if (!GroupOrderAppendPolicy.Appendable.Contains(target.Status))
            throw new ConflictException("The target batch has already been picked up and can't take more orders.");

        var sources = batches.Where(g => sourceIds.Contains(g.Id)).ToList();
        if (sources.Count == 0)
            throw new ConflictException("None of the selected source batches were found.");

        foreach (var src in sources)
        {
            if (src.CustomerId != target.CustomerId)
                throw new ConflictException("All merged batches must belong to the same customer.");
            if (!GroupOrderAppendPolicy.Appendable.Contains(src.Status))
                throw new ConflictException("A selected batch has already been picked up and can't be merged.");
        }

        // Re-parent every source order onto the target. Fix both navigations + the FK so
        // EF persists an UPDATE (not an orphan null-out) and the later delete can't cascade.
        foreach (var src in sources)
        {
            foreach (var order in src.Orders.ToList())
            {
                order.GroupOrderId = target.Id;
                target.Orders.Add(order);
                target.NumberOfPackages++;
            }
            src.Orders.Clear();
            src.NumberOfPackages = 0;
        }

        _context.GroupOrders.RemoveRange(sources);

        await _context.SaveChangesAsync(cancellationToken);

        _notifier.NotifyAdminsOrdersChanged();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       target.Id,
            SenderBusinessName: target.SenderBusinessName,
            Orders: target.Orders
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList());
    }
}
