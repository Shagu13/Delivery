using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands.SoftDeletePackage;

// ── SoftDeleteOrder ───────────────────────────────────────────────────────────
public sealed class SoftDeleteOrderCommandHandler : IRequestHandler<SoftDeleteOrderCommand>
{
    private readonly IAppDbContext _context;
    public SoftDeleteOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SoftDeleteOrderCommand request, CancellationToken cancellationToken)
    {
        // The global query filter already excludes soft-deleted rows, so a second delete
        // of the same package simply resolves to "not found".
        var order = await _context.Orders
            .Include(o => o.GroupOrder!)
                .ThenInclude(g => g.Orders)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        DateTime now = CustomTime.Now;
        order.DateDeleted = now;

        // Requirement: when the last non-deleted child of a batch is deleted, the batch
        // itself must also disappear. o.GroupOrder.Orders is already filtered to the
        // non-deleted rows, so "no sibling other than this one" means the batch is empty.
        if (order.GroupOrder is { } group && group.DateDeleted == null
            && group.Orders.All(o => o.Id == order.Id))
        {
            group.DateDeleted = now;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── BulkSoftDeleteOrders ──────────────────────────────────────────────────────
public sealed class BulkSoftDeleteOrdersCommandHandler
    : IRequestHandler<BulkSoftDeleteOrdersCommand, BulkSoftDeleteResultDto>
{
    private readonly IAppDbContext _context;
    public BulkSoftDeleteOrdersCommandHandler(IAppDbContext context) => _context = context;

    public async Task<BulkSoftDeleteResultDto> Handle(
        BulkSoftDeleteOrdersCommand request, CancellationToken cancellationToken)
    {
        List<Guid> requestedIds = request.OrderIds.Distinct().ToList();

        // One query for every target order plus each one's batch and its (still-live) siblings.
        List<Order> orders = await _context.Orders
            .Include(o => o.GroupOrder!)
                .ThenInclude(g => g.Orders)
            .Where(o => requestedIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        DateTime now = CustomTime.Now;
        foreach (Order order in orders)
            order.DateDeleted = now;

        // Any batch that just lost its last non-deleted child disappears too. The siblings in
        // group.Orders were all live at load time; the ones we stamped above now read as
        // deleted, so All(...) is true only when nothing live remains.
        int deletedBatches = 0;
        foreach (GroupOrder group in orders
                     .Where(o => o.GroupOrder is not null)
                     .Select(o => o.GroupOrder!)
                     .DistinctBy(g => g.Id))
        {
            if (group.DateDeleted == null && group.Orders.All(o => o.DateDeleted != null))
            {
                group.DateDeleted = now;
                deletedBatches++;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        HashSet<Guid> found = orders.Select(o => o.Id).ToHashSet();
        List<Guid> notFound = requestedIds.Where(id => !found.Contains(id)).ToList();

        return new BulkSoftDeleteResultDto(orders.Count, deletedBatches, notFound);
    }
}

// ── SoftDeleteGroupOrder ──────────────────────────────────────────────────────
public sealed class SoftDeleteGroupOrderCommandHandler : IRequestHandler<SoftDeleteGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    public SoftDeleteGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SoftDeleteGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var group = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        DateTime now = CustomTime.Now;
        group.DateDeleted = now;

        // group.Orders is loaded in the query above — this loop only mutates in memory,
        // no DB call per row; SaveChangesAsync runs once below.
        foreach (Order order in group.Orders)
            order.DateDeleted ??= now;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
