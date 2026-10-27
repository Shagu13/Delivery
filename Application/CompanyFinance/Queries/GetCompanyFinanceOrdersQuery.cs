using Application.Common.Interfaces;
using Application.CompanyFinance.DTOs;
using Application.Finance;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyFinance.Queries;

/// <summary>
/// The orders behind <see cref="GetCompanyFinanceOverviewQuery"/>'s profit block for [From, To]
/// (both inclusive) and the same optional recipient city/district facets. It selects through
/// <see cref="CompanyFinanceOrderSets"/> — the same definitions the overview totals use — so the
/// list cannot disagree with the figures above it.
/// </summary>
public sealed record GetCompanyFinanceOrdersQuery(
    DateOnly From,
    DateOnly To,
    IReadOnlyList<string>? Cities = null,
    IReadOnlyList<string>? Districts = null
) : IRequest<CompanyFinanceOrdersDto>;

public sealed class GetCompanyFinanceOrdersQueryHandler
    : IRequestHandler<GetCompanyFinanceOrdersQuery, CompanyFinanceOrdersDto>
{
    private readonly IAppDbContext _context;
    public GetCompanyFinanceOrdersQueryHandler(IAppDbContext context) => _context = context;

    private sealed record Row(Order Order, string? CustomerName, string? CourierName);

    public async Task<CompanyFinanceOrdersDto> Handle(
        GetCompanyFinanceOrdersQuery request,
        CancellationToken cancellationToken)
    {
        DateTime fromDt = request.From.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        DateTime toDt   = request.To.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); // exclusive

        HashSet<string> cities = (request.Cities ?? Array.Empty<string>())
            .Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).ToHashSet();
        HashSet<string> districts = (request.Districts ?? Array.Empty<string>())
            .Where(d => !string.IsNullOrWhiteSpace(d)).Select(d => d.Trim()).ToHashSet();

        // Two queries (the sets are disjoint), no per-row lookups: names ride along in the projection.
        List<Row> delivered = await Project(
            _context.Orders.AsNoTracking().Delivered(fromDt, toDt).InArea(cities, districts), cancellationToken);
        List<Row> billableFailed = await Project(
            _context.Orders.AsNoTracking().BillableFailed(fromDt, toDt).InArea(cities, districts), cancellationToken);

        List<CompanyFinanceOrderDto> orders = delivered
            .Select(r => ToDto(r, CompanyFinanceOrderGroup.Delivered, r.Order.DeliveredAt ?? r.Order.DeliveredToWarehouseAt))
            .Concat(billableFailed
                .Select(r => ToDto(r, CompanyFinanceOrderGroup.BillableFailed, OrderFinance.FailedDeliveryEventAt(r.Order))))
            .OrderByDescending(o => o.EventAt)
            .ThenBy(o => o.TrackingNumber)
            .ToList();

        return new CompanyFinanceOrdersDto(
            From:   request.From.ToString("yyyy-MM-dd"),
            To:     request.To.ToString("yyyy-MM-dd"),
            Orders: orders);
    }

    private static Task<List<Row>> Project(IQueryable<Order> orders, CancellationToken ct) =>
        orders
            .Select(o => new Row(
                o,
                // Send/Exchange own the sender through the batch; a standalone Return owns it directly.
                o.GroupOrder != null ? o.GroupOrder.SenderBusinessName
                : o.Customer != null ? o.Customer.BusinessName
                : null,
                o.Courier != null ? o.Courier.FirstName + " " + o.Courier.LastName : null))
            .ToListAsync(ct);

    private static CompanyFinanceOrderDto ToDto(Row r, CompanyFinanceOrderGroup group, DateTime? eventAt) =>
        new(
            OrderId:                  r.Order.Id,
            TrackingNumber:           r.Order.TrackingNumber,
            Group:                    group,
            OrderType:                r.Order.OrderType,
            Status:                   r.Order.Status,
            CancellationReason:       r.Order.CancellationReason,
            EventAt:                  eventAt,
            RecipientCity:            r.Order.RecipientCity,
            RecipientDistrict:        r.Order.RecipientDistrict,
            CustomerName:             r.CustomerName,
            CourierName:              r.CourierName,
            WhoPaysForCompanyService: r.Order.WhoPaysForCompanyService,
            ServiceFee:               r.Order.CompanyServicePrice,
            CourierSalary:            r.Order.CourierSalary,
            Margin:                   OrderFinance.CompanyRevenue(r.Order),
            // COD is pass-through for delivered orders only; a failed delivery collected none.
            Cod:                      group == CompanyFinanceOrderGroup.Delivered ? r.Order.AmountToCollectForPackage : null);
}
