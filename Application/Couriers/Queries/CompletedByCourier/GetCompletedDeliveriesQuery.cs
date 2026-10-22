using Application.Common.Interfaces;
using Application.Finance;
using Application.Orders.Queries.GetAllOrders;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Couriers.Queries.CompletedByCourier;

/// <summary>
/// Admin read: what couriers finished on the last-mile leg between two Georgian days (inclusive).
/// <paramref name="CourierId"/> null = every courier.
/// </summary>
public sealed record GetCompletedDeliveriesQuery(Guid? CourierId, DateTime From, DateTime To, bool HideCompanyRevenue = false)
    : IRequest<IReadOnlyList<CompletedDeliveryDto>>;

public sealed class GetCompletedDeliveriesQueryValidator : AbstractValidator<GetCompletedDeliveriesQuery>
{
    public GetCompletedDeliveriesQueryValidator()
    {
        RuleFor(x => x.To).GreaterThanOrEqualTo(x => x.From);
        RuleFor(x => x).Must(x => (x.To.Date - x.From.Date).TotalDays < CompletedRange.MaxDays)
            .WithMessage($"The date range may not exceed {CompletedRange.MaxDays} days.");
    }
}

public sealed class GetCompletedDeliveriesQueryHandler
    : IRequestHandler<GetCompletedDeliveriesQuery, IReadOnlyList<CompletedDeliveryDto>>
{
    private readonly IAppDbContext _context;
    public GetCompletedDeliveriesQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CompletedDeliveryDto>> Handle(
        GetCompletedDeliveriesQuery request, CancellationToken cancellationToken)
    {
        // Timestamps are Georgian wall-clock, so the day bounds compare directly (exclusive upper bound).
        DateTime from = request.From.Date;
        DateTime to   = request.To.Date.AddDays(1);

        IQueryable<Domain.Order> query = _context.Orders
            .AsNoTracking()
            .Include(o => o.GroupOrder)
            .Include(o => o.Customer)
            .Include(o => o.Courier)
            .Where(o => o.CourierId != null);

        if (request.CourierId is Guid courierId)
            query = query.Where(o => o.CourierId == courierId);

        // Coarse, index-friendly cut; the exact "delivered vs billable-failed vs neither" call is made in
        // memory through OrderFinance so the rule lives in one place.
        //  • Send/Exchange delivered      → DeliveredAt, no cancellation reason.
        //  • Send/Exchange failed attempt → a cancellation reason, dated by the courier's CancelledAt
        //                                   (admin "returned to sender" only stamps DeliveredAt).
        //  • standalone Return            → the courier brought it to the warehouse (DeliveredToWarehouseAt).
        query = query.Where(o =>
            (o.OrderType != OrderType.Return
                && ((o.CancellationReason == null && o.DeliveredAt >= from && o.DeliveredAt < to)
                    || (o.CancellationReason != null
                        && (o.CancelledAt ?? o.DeliveredAt) >= from && (o.CancelledAt ?? o.DeliveredAt) < to)))
            || (o.OrderType == OrderType.Return
                && o.DeliveredToWarehouseAt >= from && o.DeliveredToWarehouseAt < to));

        List<Domain.Order> orders = await query.ToListAsync(cancellationToken);
        AdminOrderListMapper.GeoNames geo = await AdminOrderListMapper.LoadGeoNamesAsync(_context, cancellationToken);

        List<CompletedDeliveryDto> result = new(orders.Count);
        foreach (Domain.Order o in orders)
        {
            bool failed = OrderFinance.IsBillableFailedDelivery(o);
            DateTime? completedAt = o.OrderType == OrderType.Return ? o.DeliveredToWarehouseAt
                : failed                                            ? o.CancelledAt ?? o.DeliveredAt
                : o.CancellationReason == null                      ? o.DeliveredAt
                : null; // cancelled for a non-billable reason (never arrived / refused before the courier reached them)
            if (completedAt is not DateTime at || at < from || at >= to) continue;

            result.Add(new CompletedDeliveryDto(
                Order:          AdminOrderListMapper.ToDto(o, geo, request.HideCompanyRevenue),
                CompletedAt:    at,
                IsFailed:       failed,
                FailureReason:  failed ? o.CancellationReason!.Value.ToString() : null,
                FailureComment: failed ? o.CancellationComment : null));
        }

        return result.OrderByDescending(r => r.CompletedAt).ToList();
    }
}
