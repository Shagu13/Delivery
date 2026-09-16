using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAdminOverviewStats;

public sealed record AdminOverviewRecentItemDto(
    Guid Id,
    string SenderBusinessName,
    string SenderFirstName,
    string SenderLastName,
    string PickUpCity,
    int NumberOfPackages,
    OrderStatus Status,
    DateTime CreatedAt);

public sealed record AdminOverviewStatsDto(
    int TotalOrders,
    int PendingPickup,
    int InTransit,
    List<AdminOverviewRecentItemDto> Recent);

/// <summary>
/// Lightweight aggregate counts + an 8-row "recent batches" list for the Admin Overview tab.
/// Replaces what used to be a plain <c>GET /api/grouporders?pageSize=1000</c> call from the
/// client — that pulled up to 1000 fully-hydrated batches (each with its Courier, Customer,
/// and Customer.SpecialPrices.District.City graphs) just to compute three counts and show
/// the newest 8 rows, which cost several MB and several seconds once the table has real
/// history. This computes the counts as plain SQL aggregates and only ever hydrates the
/// handful of fields the 8 shown rows actually display.
/// </summary>
public sealed record GetAdminOverviewStatsQuery : IRequest<AdminOverviewStatsDto>;

public sealed class GetAdminOverviewStatsQueryHandler
    : IRequestHandler<GetAdminOverviewStatsQuery, AdminOverviewStatsDto>
{
    // Mirrors GetAllGroupOrdersQueryHandler.CancelledStatuses — a standalone order in one of
    // these statuses is excluded from the count, same as it's excluded from the Packages list.
    private static readonly OrderStatus[] CancelledStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    ];

    private static readonly OrderStatus[] PendingPickupStatuses =
    [
        OrderStatus.Pending,
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
    ];

    private static readonly OrderStatus[] InTransitStatuses =
    [
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
    ];

    private readonly IAppDbContext _context;
    public GetAdminOverviewStatsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<AdminOverviewStatsDto> Handle(
        GetAdminOverviewStatsQuery request,
        CancellationToken cancellationToken)
    {
        // A standalone order (GroupOrderId == null) is its own "batch" of one — see
        // GroupOrderMapping.MapStandalone — so it counts toward every stat below exactly
        // like a GroupOrder's child order would.
        var standaloneOrders = _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrderId == null && o.CustomerId != null && o.Customer != null
                     && !CancelledStatuses.Contains(o.Status));

        // Every Order belongs to a GroupOrder xor is a standalone Order — one CountAsync
        // over the whole table, no join needed.
        var totalOrders = await _context.Orders.AsNoTracking()
            .CountAsync(o => o.GroupOrderId != null
                           || (o.CustomerId != null && !CancelledStatuses.Contains(o.Status)), cancellationToken);

        var pendingPickup =
            await _context.GroupOrders.AsNoTracking()
                .CountAsync(go => PendingPickupStatuses.Contains(go.Status), cancellationToken)
            + await standaloneOrders
                .CountAsync(o => PendingPickupStatuses.Contains(o.Status), cancellationToken);

        // In-transit statuses live on the Order itself regardless of GroupOrderId, so this is
        // a single count over the whole table too.
        var inTransit = await _context.Orders.AsNoTracking()
            .CountAsync(o => InTransitStatuses.Contains(o.Status), cancellationToken);

        // ── Recent 8: merge-paginate the same way GetAllGroupOrdersQueryHandler's Phase 1
        //    does, but only ever select the handful of fields this list actually renders. ──
        var recentGo = await _context.GroupOrders.AsNoTracking()
            .OrderByDescending(go => go.CreatedAt)
            .Take(8)
            .Select(go => new AdminOverviewRecentItemDto(
                go.Id, go.SenderBusinessName, go.SenderFirstName, go.SenderLastName,
                go.PickUpCity, go.NumberOfPackages, go.Status, go.CreatedAt))
            .ToListAsync(cancellationToken);

        var recentSo = await standaloneOrders
            .OrderByDescending(o => o.CreatedAt)
            .Take(8)
            // A standalone Return's pickup is technically its own ReturnPickupCity, not the
            // customer's address (see MapStandalone) — skipped here since this list is a
            // recent-activity glance, not the authoritative Packages view.
            .Select(o => new AdminOverviewRecentItemDto(
                o.Id, o.Customer!.BusinessName, o.Customer.FirstName, o.Customer.LastName,
                o.Customer.City, 1, o.Status, o.CreatedAt))
            .ToListAsync(cancellationToken);

        var recent = recentGo.Concat(recentSo)
            .OrderByDescending(r => r.CreatedAt)
            .Take(8)
            .ToList();

        return new AdminOverviewStatsDto(totalOrders, pendingPickup, inTransit, recent);
    }
}
