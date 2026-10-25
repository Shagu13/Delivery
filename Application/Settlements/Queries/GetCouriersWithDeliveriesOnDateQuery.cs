using Application.Common.Interfaces;
using Application.Couriers;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

/// <summary>
/// Returns the IDs of couriers who were active on the given date, used to narrow the admin's
/// settlement courier list. "Active" follows each courier's default basis
/// (<see cref="CourierDateBasisPolicy"/>): regional couriers — orders assigned to them that day;
/// Tbilisi/Rustavi couriers — physically delivered at least one order that day, which mirrors the
/// settlement preview: a Send/Exchange reaching its terminal status (dated by DeliveredAt) or a
/// Return reaching the warehouse (dated by DeliveredToWarehouseAt).
/// </summary>
public sealed record GetCouriersWithDeliveriesOnDateQuery(DateOnly Date)
    : IRequest<IReadOnlyList<Guid>>;

public sealed class GetCouriersWithDeliveriesOnDateQueryHandler
    : IRequestHandler<GetCouriersWithDeliveriesOnDateQuery, IReadOnlyList<Guid>>
{
    private readonly IAppDbContext _context;
    public GetCouriersWithDeliveriesOnDateQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<Guid>> Handle(
        GetCouriersWithDeliveriesOnDateQuery request,
        CancellationToken cancellationToken)
    {
        var dayStart = request.Date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var dayEnd   = request.Date.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc);

        // Each courier is matched on their own default basis (CourierDateBasisPolicy): regional
        // couriers by the day orders were assigned to them, Tbilisi/Rustavi by the delivery events
        // below. One small roster read splits the two groups; no query runs per courier.
        var roster = await _context.Couriers
            .AsNoTracking()
            .Select(c => new { c.Id, c.AssignedCity })
            .ToListAsync(cancellationToken);
        List<Guid> assignedBasisIds = roster
            .Where(c => CourierDateBasisPolicy.DefaultFor(c.AssignedCity) == CourierDateBasis.Assigned)
            .Select(c => c.Id)
            .ToList();

        List<Guid> assignedOnDay = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null
                     && assignedBasisIds.Contains(o.CourierId.Value)
                     && o.AssignedToCourierAt >= dayStart
                     && o.AssignedToCourierAt <= dayEnd)
            .Select(o => o.CourierId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        List<Guid> deliveredOnDay = await _context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId != null
                     && !assignedBasisIds.Contains(o.CourierId.Value)
                     && (((o.Status == OrderStatus.DeliveredToRecipient
                           || o.Status == OrderStatus.ExchangeCompleted
                           // An Exchange finalized as ReturnedToSender is still dated by its
                           // delivery event (it has no warehouse drop-off timestamp).
                           || (o.OrderType == OrderType.Exchange && o.Status == OrderStatus.ReturnedToSender))
                          && o.DeliveredAt >= dayStart
                          && o.DeliveredAt <= dayEnd)
                       || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                            || o.Status == OrderStatus.ReturnedToSender)
                          && o.DeliveredToWarehouseAt >= dayStart
                          && o.DeliveredToWarehouseAt <= dayEnd)
                       // Billable failed deliveries (the courier earns salary, so the day is
                       // "active"); mirrors OrderFinance.IsBillableFailedDelivery, dated by
                       // the billing event = DeliveredAt ?? CancelledAt.
                       || (o.OrderType != OrderType.Return
                           && o.CancellationReason != null
                           && o.CancellationReason != CancellationReason.WarehouseNotReceived
                           && o.CancellationReason != CancellationReason.DidNotWant
                           && (o.DeliveredAt ?? o.CancelledAt) >= dayStart
                           && (o.DeliveredAt ?? o.CancelledAt) <= dayEnd)
                       // Postponed deliveries are listed in the settlement modal (dated by the
                       // postpone event), so the courier must appear on that day too.
                       || (o.Status == OrderStatus.DeliveryPostponed
                           && o.PostponedAt >= dayStart
                           && o.PostponedAt <= dayEnd)))
            .Select(o => o.CourierId!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        return assignedOnDay.Concat(deliveredOnDay).Distinct().ToList();
    }
}
