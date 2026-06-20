using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerStatistics.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
namespace Application.CustomerStatistics.Queries;

/// <summary>
/// Customer-facing (read-only): order activity statistics for the authenticated
/// customer, for a single year. Covers every order the customer owns — Send and
/// Exchange (via their GroupOrder) and standalone Returns. When <see cref="Year"/>
/// is null the most recent year with activity is used.
/// </summary>
public sealed record GetMyCustomerStatisticsQuery(
    string CustomerUserId,
    int?   Year
) : IRequest<CustomerStatisticsDto>;

public sealed class GetMyCustomerStatisticsQueryHandler
    : IRequestHandler<GetMyCustomerStatisticsQuery, CustomerStatisticsDto>
{
    private readonly IAppDbContext _context;
    public GetMyCustomerStatisticsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerStatisticsDto> Handle(
        GetMyCustomerStatisticsQuery request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CustomerUserId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerUserId);

        // Every order the customer owns, via either ownership path (see CLAUDE.md).
        var orders = await _context.Orders
            .AsNoTracking()
            .Where(o => o.GroupOrder!.CustomerId == customer.Id || o.CustomerId == customer.Id)
            .Select(o => new
            {
                o.Status,
                o.CreatedAt,
                o.RecipientName,
                o.RecipientPhone,
                o.RecipientCity,
                o.RecipientDistrict,
                o.RecipientAddress
            })
            .ToListAsync(cancellationToken);

        var availableYears = orders
            .Select(o => o.CreatedAt.Year)
            .Distinct()
            .OrderByDescending(y => y)
            .ToList();

        int year = request.Year
            ?? (availableYears.Count > 0 ? availableYears[0] : CustomTime.Now.Year);

        var inYear = orders.Where(o => o.CreatedAt.Year == year).ToList();

        var monthly = Enumerable.Range(1, 12).Select(month =>
        {
            var bucket    = inYear.Where(o => o.CreatedAt.Month == month).ToList();
            int delivered = bucket.Count(o => IsDelivered(o.Status));
            int cancelled = bucket.Count(o => IsCancelled(o.Status));
            int inTransit = bucket.Count - delivered - cancelled;
            return new MonthlyOrderStatDto(month, bucket.Count, delivered, inTransit, cancelled);
        }).ToList();

        var topRecipients = inYear
            .GroupBy(o => o.RecipientPhone)
            .Select(g =>
            {
                var latest = g.OrderByDescending(o => o.CreatedAt).First();
                return new TopRecipientDto(
                    Name:       latest.RecipientName,
                    Phone:      g.Key,
                    City:       latest.RecipientCity,
                    District:   latest.RecipientDistrict,
                    Address:    latest.RecipientAddress,
                    OrderCount: g.Count());
            })
            .OrderByDescending(r => r.OrderCount)
            .ThenBy(r => r.Name)
            .Take(10)
            .ToList();

        return new CustomerStatisticsDto(
            Year:           year,
            AvailableYears: availableYears,
            Monthly:        monthly,
            TotalPlaced:    inYear.Count,
            TotalDelivered: inYear.Count(o => IsDelivered(o.Status)),
            TotalInTransit: inYear.Count(o => !IsDelivered(o.Status) && !IsCancelled(o.Status)),
            TotalCancelled: inYear.Count(o => IsCancelled(o.Status)),
            TopRecipients:  topRecipients);
    }

    // Terminal success across both flows (see CLAUDE.md "Terminal statuses").
    private static bool IsDelivered(OrderStatus s) => s
        is OrderStatus.DeliveredToRecipient
        or OrderStatus.ExchangeCompleted
        or OrderStatus.DeliveredReturnOrderToWarehouse
        or OrderStatus.ReturnedToSender;

    private static bool IsCancelled(OrderStatus s) => s
        is OrderStatus.CancelledByAdmin
        or OrderStatus.CancelledBySender
        or OrderStatus.OrderNotAccepted;
}
