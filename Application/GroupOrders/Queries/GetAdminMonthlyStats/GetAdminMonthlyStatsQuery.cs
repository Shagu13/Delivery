using Application.Common.Interfaces;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetAdminMonthlyStats;

/// <summary>Coarse outcome bucket an order falls in for the Overview pie. Serialized as a string.</summary>
public enum MonthlyStatusGroup
{
    Delivered,
    Active,
    Postponed,
    Cancelled,
    Returned,
}

public sealed record MonthlyStatusCountDto(OrderStatus Status, MonthlyStatusGroup Group, int Count);
public sealed record MonthlyDayCountDto(int Day, MonthlyStatusGroup Group, int Count);
public sealed record MonthlyCityCountDto(string City, MonthlyStatusGroup Group, int Count);
public sealed record MonthlyCourierCountDto(Guid CourierId, string CourierName, MonthlyStatusGroup Group, int Count);

/// <summary>
/// Every list is pre-split by <see cref="MonthlyStatusGroup"/> so the client can filter by a
/// clicked pie slice and re-sum locally, with no refetch.
/// </summary>
public sealed record AdminMonthlyStatsDto(
    int Year,
    int Month,
    int Total,
    List<MonthlyStatusCountDto> Statuses,
    List<MonthlyDayCountDto> Days,
    List<MonthlyCityCountDto> Cities,
    List<MonthlyCourierCountDto> Couriers);

/// <summary>
/// Admin Overview monthly statistics: every Order <b>created</b> in the given month (Georgian
/// calendar), optionally narrowed to one <see cref="OrderType"/>. Counts are plain SQL
/// aggregates — no entities are hydrated.
/// </summary>
public sealed record GetAdminMonthlyStatsQuery(int Year, int Month, OrderType? Type) : IRequest<AdminMonthlyStatsDto>;

public sealed class GetAdminMonthlyStatsQueryValidator : AbstractValidator<GetAdminMonthlyStatsQuery>
{
    public GetAdminMonthlyStatsQueryValidator()
    {
        RuleFor(x => x.Year).InclusiveBetween(2000, 2100);
        RuleFor(x => x.Month).InclusiveBetween(1, 12);
        RuleFor(x => x.Type).IsInEnum().When(x => x.Type.HasValue);
    }
}

public sealed class GetAdminMonthlyStatsQueryHandler
    : IRequestHandler<GetAdminMonthlyStatsQuery, AdminMonthlyStatsDto>
{
    private readonly IAppDbContext _context;
    public GetAdminMonthlyStatsQueryHandler(IAppDbContext context) => _context = context;

    // The one place the status → bucket rule lives. "Postponed" is the current status only
    // (orders carry no postponed-until date); a Return is "Returned" once sent back to the
    // sender, any earlier Return step is still Active.
    internal static MonthlyStatusGroup GroupOf(OrderStatus status) => status switch
    {
        OrderStatus.DeliveredToRecipient or OrderStatus.AllDelivered or OrderStatus.ExchangeCompleted
            => MonthlyStatusGroup.Delivered,
        OrderStatus.DeliveryPostponed
            => MonthlyStatusGroup.Postponed,
        OrderStatus.CancelledBySender or OrderStatus.CancelledByAdmin or OrderStatus.OrderNotAccepted
            => MonthlyStatusGroup.Cancelled,
        OrderStatus.ReturnedToSender
            => MonthlyStatusGroup.Returned,
        _ => MonthlyStatusGroup.Active,
    };

    public async Task<AdminMonthlyStatsDto> Handle(
        GetAdminMonthlyStatsQuery request,
        CancellationToken cancellationToken)
    {
        // CreatedAt is stored as Georgian wall-clock, so a plain half-open range is correct.
        DateTime from = new(request.Year, request.Month, 1);
        DateTime to = from.AddMonths(1);

        IQueryable<Domain.Order> orders = _context.Orders.AsNoTracking()
            .Where(o => o.CreatedAt >= from && o.CreatedAt < to);
        if (request.Type.HasValue)
            orders = orders.Where(o => o.OrderType == request.Type.Value);

        var statusRows = await orders
            .GroupBy(o => o.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var dayRows = await orders
            .GroupBy(o => new { o.CreatedAt.Day, o.Status })
            .Select(g => new { g.Key.Day, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var cityRows = await orders
            .GroupBy(o => new { o.RecipientCity, o.Status })
            .Select(g => new { g.Key.RecipientCity, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);

        // Last-mile courier (Order.CourierId) — orders not yet handed to one are skipped.
        var courierRows = await orders
            .Where(o => o.CourierId != null)
            .GroupBy(o => new { CourierId = o.CourierId!.Value, o.Status })
            .Select(g => new { g.Key.CourierId, g.Key.Status, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var courierIds = courierRows.Select(r => r.CourierId).Distinct().ToList();
        var courierNames = await _context.Couriers.AsNoTracking()
            .Where(c => courierIds.Contains(c.Id))
            .Select(c => new { c.Id, c.FirstName, c.LastName })
            .ToDictionaryAsync(c => c.Id, c => $"{c.FirstName} {c.LastName}".Trim(), cancellationToken);

        // Several statuses collapse into one bucket, so re-sum per bucket after mapping.
        var statuses = statusRows
            .Select(r => new MonthlyStatusCountDto(r.Status, GroupOf(r.Status), r.Count))
            .OrderByDescending(r => r.Count)
            .ToList();

        var days = dayRows
            .GroupBy(r => (r.Day, Group: GroupOf(r.Status)))
            .Select(g => new MonthlyDayCountDto(g.Key.Day, g.Key.Group, g.Sum(r => r.Count)))
            .OrderBy(r => r.Day)
            .ToList();

        var cities = cityRows
            .GroupBy(r => (r.RecipientCity, Group: GroupOf(r.Status)))
            .Select(g => new MonthlyCityCountDto(g.Key.RecipientCity, g.Key.Group, g.Sum(r => r.Count)))
            .ToList();

        var couriers = courierRows
            .GroupBy(r => (r.CourierId, Group: GroupOf(r.Status)))
            .Select(g => new MonthlyCourierCountDto(
                g.Key.CourierId,
                courierNames.GetValueOrDefault(g.Key.CourierId, string.Empty),
                g.Key.Group,
                g.Sum(r => r.Count)))
            .ToList();

        return new AdminMonthlyStatsDto(
            request.Year, request.Month, statusRows.Sum(r => r.Count),
            statuses, days, cities, couriers);
    }
}
