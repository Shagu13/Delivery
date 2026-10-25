using Application.Common.Interfaces;
using Application.Couriers;
using Application.Finance;
using Application.Settlements.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Settlements.Queries;

/// <summary>
/// Builds a courier's per-day settlement summaries live by grouping orders (the
/// CourierSettlement table no longer exists). Shared by the courier "my settlements"
/// and the admin "by courier" reads so both stay in lock-step.
/// </summary>
internal static class CourierSettlementProjection
{
    /// <summary>
    /// Day summaries for <paramref name="courierId"/> over [fromDt, toDt) (UTC). Days are
    /// keyed by the courier's delivery event (DeliveredAt ?? DeliveredToWarehouseAt); a day
    /// appears if anything happened on it (delivery, pickup, cancellation or postpone).
    /// Regional couriers (<see cref="CourierDateBasisPolicy"/>) are keyed by the day orders were
    /// assigned to them instead — see <see cref="BuildByAssignedDayAsync"/>.
    /// </summary>
    public static async Task<IReadOnlyList<CourierSettlementItemDto>> BuildAsync(
        IAppDbContext context, Guid courierId, DateTime fromDt, DateTime toDt, CancellationToken ct)
    {
        // Regional couriers (CourierDateBasisPolicy) are summarised per assignment day instead.
        if (await CourierDateBasisPolicy.ForCourierAsync(context, courierId, ct) == CourierDateBasis.Assigned)
            return await BuildByAssignedDayAsync(context, courierId, fromDt, toDt, ct);

        // Delivered orders (drive the money figures), dated by the delivery event.
        var delivered = await context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courierId
                     && (((o.Status == OrderStatus.DeliveredToRecipient
                           || o.Status == OrderStatus.ExchangeCompleted
                           // An Exchange finalized as ReturnedToSender is still dated by its
                           // delivery event (it has no warehouse drop-off timestamp).
                           || (o.OrderType == OrderType.Exchange && o.Status == OrderStatus.ReturnedToSender))
                          && o.DeliveredAt >= fromDt && o.DeliveredAt < toDt)
                       || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                            || o.Status == OrderStatus.ReturnedToSender)
                          && o.DeliveredToWarehouseAt >= fromDt && o.DeliveredToWarehouseAt < toDt)))
            .ToListAsync(ct);

        // Billable failed deliveries (mirrors OrderFinance.IsBillableFailedDelivery; dated by the
        // billing event = DeliveredAt ?? CancelledAt). The signal is an explicit (non-warehouse)
        // CancellationReason recorded when the courier/admin cancelled-and-charged or returned to
        // sender. The courier still earns salary on these, so they join the money set. Disjoint
        // from `delivered`: a delivered order carries no reason, and a Send/Exchange ReturnedToSender
        // has no DeliveredToWarehouseAt (that branch only catches Return drop-offs).
        var billableFailed = await context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courierId
                     && o.OrderType != OrderType.Return
                     && o.CancellationReason != null
                     && o.CancellationReason != CancellationReason.WarehouseNotReceived
                     && o.CancellationReason != CancellationReason.DidNotWant
                     && (o.DeliveredAt ?? o.CancelledAt) >= fromDt
                     && (o.DeliveredAt ?? o.CancelledAt) < toDt)
            .ToListAsync(ct);

        delivered = delivered.Concat(billableFailed).ToList();

        // Packages picked up per day (GroupOrder.PickedUpAt).
        var pickedUp = await context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId == courierId && g.PickedUpAt >= fromDt && g.PickedUpAt < toDt)
            .Select(g => new { g.PickedUpAt, g.NumberOfPackages })
            .ToListAsync(ct);

        // Cancelled (by CreatedAt — no CancelledAt is stored) and postponed (by PostponedAt).
        var cancelled = await context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courierId
                     && o.Status == OrderStatus.CancelledByAdmin
                     && o.CreatedAt >= fromDt && o.CreatedAt < toDt)
            .Select(o => o.CreatedAt)
            .ToListAsync(ct);

        var postponed = await context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courierId
                     && o.PostponedAt != null
                     && o.PostponedAt >= fromDt && o.PostponedAt < toDt)
            .Select(o => o.PostponedAt!.Value)
            .ToListAsync(ct);

        static DateOnly DeliveryDay(Order o) =>
            DateOnly.FromDateTime((o.DeliveredAt ?? o.DeliveredToWarehouseAt ?? o.CancelledAt)!.Value);

        var deliveredByDay = delivered.GroupBy(DeliveryDay).ToDictionary(g => g.Key, g => g.ToList());
        var pickedByDay    = pickedUp.GroupBy(p => DateOnly.FromDateTime(p.PickedUpAt!.Value))
                                     .ToDictionary(g => g.Key, g => g.Sum(p => p.NumberOfPackages));
        var cancelledByDay = cancelled.GroupBy(DateOnly.FromDateTime).ToDictionary(g => g.Key, g => g.Count());
        var postponedByDay = postponed.GroupBy(DateOnly.FromDateTime).ToDictionary(g => g.Key, g => g.Count());

        var days = deliveredByDay.Keys
            .Union(pickedByDay.Keys).Union(cancelledByDay.Keys).Union(postponedByDay.Keys)
            .OrderByDescending(d => d);

        var result = new List<CourierSettlementItemDto>();
        foreach (var day in days)
        {
            var orders = deliveredByDay.TryGetValue(day, out var o) ? o : new List<Order>();
            result.Add(new CourierSettlementItemDto(
                Date:                          day.ToString("yyyy-MM-dd"),
                TotalOrdersPickedUp:           pickedByDay.TryGetValue(day, out var p) ? p : 0,
                TotalOrdersDelivered:          orders.Count,
                NumberOfOrdersCancelled:       cancelledByDay.TryGetValue(day, out var c) ? c : 0,
                NumberOfOrderPostponed:        postponedByDay.TryGetValue(day, out var pp) ? pp : 0,
                TotalAmountOfCashCollected:    orders.Sum(x => x.AmountOfCashCollected ?? 0m),
                TotalCompanyServiceRevenue:    orders.Sum(x => x.CompanyServicePrice),
                TotalCourierSalary:            orders.Sum(x => x.CourierSalary ?? 0m),
                TotalCourierSalaryPaid:        orders.Sum(x => x.CourierSalaryPaidAmount ?? 0m),
                // Due = cash collected − all salary earned (incl. sender-pays), same as the admin settlement modal.
                TotalCourierTransferToCompany: OrderFinance.CourierNetCashDue(orders),
                // Income = fees earned − courier salary; CompanyNetCash is a payout-timing-dependent cash position.
                TotalCompanyNetIncome:         orders.Sum(OrderFinance.CompanyRevenue),
                DateBasis:                     nameof(CourierDateBasis.Delivered),
                TotalOrdersAssigned:           0));
        }

        return result;
    }

    /// <summary>
    /// Assignment-dated summaries for regional couriers: a day holds every order assigned to the
    /// courier that day (<c>AssignedToCourierAt</c>), so a batch stays together however long it takes
    /// to deliver. Money figures and the delivered count cover only the orders whose leg is complete
    /// (<see cref="OrderFinance.IsCourierLegComplete"/>); the rest are still open and count only in
    /// <c>TotalOrdersAssigned</c> (or the cancelled / postponed counters).
    /// </summary>
    private static async Task<IReadOnlyList<CourierSettlementItemDto>> BuildByAssignedDayAsync(
        IAppDbContext context, Guid courierId, DateTime fromDt, DateTime toDt, CancellationToken ct)
    {
        List<Order> assigned = await context.Orders
            .AsNoTracking()
            .Where(o => o.CourierId == courierId
                     && o.AssignedToCourierAt >= fromDt && o.AssignedToCourierAt < toDt)
            .ToListAsync(ct);

        // Packages picked up per day (GroupOrder.PickedUpAt) — the pickup leg is not assignment-dated.
        var pickedUp = await context.GroupOrders
            .AsNoTracking()
            .Where(g => g.CourierId == courierId && g.PickedUpAt >= fromDt && g.PickedUpAt < toDt)
            .Select(g => new { g.PickedUpAt, g.NumberOfPackages })
            .ToListAsync(ct);

        var assignedByDay = assigned.GroupBy(o => DateOnly.FromDateTime(o.AssignedToCourierAt!.Value))
                                    .ToDictionary(g => g.Key, g => g.ToList());
        var pickedByDay   = pickedUp.GroupBy(p => DateOnly.FromDateTime(p.PickedUpAt!.Value))
                                    .ToDictionary(g => g.Key, g => g.Sum(p => p.NumberOfPackages));

        var days = assignedByDay.Keys.Union(pickedByDay.Keys).OrderByDescending(d => d);

        var result = new List<CourierSettlementItemDto>();
        foreach (var day in days)
        {
            List<Order> dayOrders = assignedByDay.TryGetValue(day, out var a) ? a : new List<Order>();
            List<Order> orders    = dayOrders.Where(OrderFinance.IsCourierLegComplete).ToList();
            result.Add(new CourierSettlementItemDto(
                Date:                          day.ToString("yyyy-MM-dd"),
                TotalOrdersPickedUp:           pickedByDay.TryGetValue(day, out var p) ? p : 0,
                TotalOrdersDelivered:          orders.Count,
                NumberOfOrdersCancelled:       dayOrders.Count(o => o.Status == OrderStatus.CancelledByAdmin),
                NumberOfOrderPostponed:        dayOrders.Count(o => o.Status == OrderStatus.DeliveryPostponed),
                TotalAmountOfCashCollected:    orders.Sum(x => x.AmountOfCashCollected ?? 0m),
                TotalCompanyServiceRevenue:    orders.Sum(x => x.CompanyServicePrice),
                TotalCourierSalary:            orders.Sum(x => x.CourierSalary ?? 0m),
                TotalCourierSalaryPaid:        orders.Sum(x => x.CourierSalaryPaidAmount ?? 0m),
                TotalCourierTransferToCompany: OrderFinance.CourierNetCashDue(orders),
                TotalCompanyNetIncome:         orders.Sum(OrderFinance.CompanyRevenue),
                DateBasis:                     nameof(CourierDateBasis.Assigned),
                TotalOrdersAssigned:           dayOrders.Count));
        }

        return result;
    }
}
