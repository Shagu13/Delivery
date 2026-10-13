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
    List<AdminOverviewRecentItemDto> Recent);

/// <summary>
/// The 8-row "recent batches" list for the Admin Overview tab. Replaces what used to be a plain
/// <c>GET /api/grouporders?pageSize=1000</c> call from the client — that pulled up to 1000
/// fully-hydrated batches just to show the newest 8 rows. Only ever hydrates the handful of
/// fields the shown rows display. The monthly counts live in <c>GetAdminMonthlyStatsQuery</c>.
/// </summary>
public sealed record GetAdminOverviewStatsQuery : IRequest<AdminOverviewStatsDto>;

public sealed class GetAdminOverviewStatsQueryHandler
    : IRequestHandler<GetAdminOverviewStatsQuery, AdminOverviewStatsDto>
{
    // Mirrors GetAllGroupOrdersQueryHandler.CancelledStatuses — a standalone order in one of
    // these statuses is excluded, same as it's excluded from the Packages list.
    private static readonly OrderStatus[] CancelledStatuses =
    [
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    ];

    private readonly IAppDbContext _context;
    public GetAdminOverviewStatsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<AdminOverviewStatsDto> Handle(
        GetAdminOverviewStatsQuery request,
        CancellationToken cancellationToken)
    {
        // A standalone order (GroupOrderId == null) is its own "batch" of one — see
        // GroupOrderMapping.MapStandalone — so it is listed like a GroupOrder.
        var standaloneOrders = _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrderId == null && o.CustomerId != null && o.Customer != null
                     && !CancelledStatuses.Contains(o.Status));

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

        return new AdminOverviewStatsDto(recent);
    }
}
