using Application.Common.Interfaces;
using Application.GroupOrders.DTOs;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Queries.GetPickupDay;

/// <summary>Per-customer order/unattached counts for one day (admin Pick-Up page).</summary>
public sealed record GetPickupDayQuery(DateTime Date)
    : IRequest<IReadOnlyList<PickupDayCustomerDto>>;

public sealed class GetPickupDayQueryHandler
    : IRequestHandler<GetPickupDayQuery, IReadOnlyList<PickupDayCustomerDto>>
{
    private static readonly OrderStatus[] CancelledStatuses =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private readonly IAppDbContext _context;
    public GetPickupDayQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<PickupDayCustomerDto>> Handle(
        GetPickupDayQuery request,
        CancellationToken cancellationToken)
    {
        var date = request.Date.Date;

        // Every non-cancelled order placed that day that is linked to a customer, by
        // either path: standalone (Order.CustomerId) or batched (GroupOrder.CustomerId).
        var rows = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CreatedAt.Date == date
                     && !CancelledStatuses.Contains(o.Status)
                     && (o.CustomerId != null
                         || (o.GroupOrder != null && o.GroupOrder.CustomerId != null)))
            .Select(o => new
            {
                CustomerId   = o.CustomerId ?? o.GroupOrder!.CustomerId,
                // Returns stay standalone for life and are never groupable, so they must not
                // inflate the "N ungrouped" badge that opens an (empty) grouping modal.
                IsUnattached = o.GroupOrderId == null && o.OrderType != OrderType.Return,
            })
            .ToListAsync(cancellationToken);

        var grouped = rows
            .Where(r => r.CustomerId.HasValue)
            .GroupBy(r => r.CustomerId!.Value)
            .Select(g => new
            {
                CustomerId       = g.Key,
                OrdersPlaced     = g.Count(),
                UnattachedOrders = g.Count(r => r.IsUnattached),
            })
            .ToList();

        if (grouped.Count == 0)
            return Array.Empty<PickupDayCustomerDto>();

        var customerIds = grouped.Select(g => g.CustomerId).ToList();
        var names = await _context.Customers
            .AsNoTracking()
            .Where(c => customerIds.Contains(c.Id))
            .Select(c => new { c.Id, c.BusinessName })
            .ToDictionaryAsync(c => c.Id, c => c.BusinessName, cancellationToken);

        return grouped
            .Select(g => new PickupDayCustomerDto(
                CustomerId:       g.CustomerId,
                BusinessName:     names.GetValueOrDefault(g.CustomerId, string.Empty),
                OrdersPlaced:     g.OrdersPlaced,
                UnattachedOrders: g.UnattachedOrders))
            .OrderByDescending(c => c.UnattachedOrders)
            .ThenBy(c => c.BusinessName)
            .ToList();
    }
}
