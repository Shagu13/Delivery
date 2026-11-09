using System.Linq.Expressions;
using Domain;
using Domain.Enums;

namespace Application.CompanyFinance;

/// <summary>
/// The three order sets the company finance overview is built from, defined ONCE so the totals
/// (<see cref="Queries.GetCompanyFinanceOverviewQueryHandler"/>) and the order drill-down
/// (<see cref="Queries.GetCompanyFinanceOrdersQueryHandler"/>) can never disagree about which
/// orders count. They run in SQL, so the billable-failed rule is inlined here rather than
/// calling <c>OrderFinance.IsBillableFailedDelivery</c> — keep the two in step.
///
/// The sets are pairwise disjoint: an order is in at most one of them.
/// </summary>
internal static class CompanyFinanceOrderSets
{
    // Mirrors OrderFinance.IsBillableFailedDelivery (a Return is never billable this way).
    private static readonly Expression<Func<Order, bool>> IsBillableFailed = o =>
        o.OrderType != OrderType.Return
        && o.CancellationReason != null
        && o.CancellationReason != CancellationReason.WarehouseNotReceived
        && o.CancellationReason != CancellationReason.DidNotWant;

    // Logical negation of IsBillableFailed, spelled out because EF can't translate a negated
    // expression-valued field.
    private static readonly Expression<Func<Order, bool>> IsNotBillableFailed = o =>
        o.OrderType == OrderType.Return
        || o.CancellationReason == null
        || o.CancellationReason == CancellationReason.WarehouseNotReceived
        || o.CancellationReason == CancellationReason.DidNotWant;

    /// <summary>Recipient city AND district facets, each applied only when non-empty.</summary>
    public static IQueryable<Order> InArea(
        this IQueryable<Order> orders, HashSet<string> cities, HashSet<string> districts) =>
        orders.Where(o =>
            (cities.Count == 0 || cities.Contains(o.RecipientCity!))
            && (districts.Count == 0 || districts.Contains(o.RecipientDistrict!)));

    /// <summary>
    /// Delivered orders whose delivery event falls in [from, to) — last-mile deliveries by
    /// <c>DeliveredAt</c>, return drop-offs by <c>DeliveredToWarehouseAt</c>. <paramref name="from"/>
    /// null = no lower bound (cumulative to <paramref name="to"/>).
    /// Billable failed deliveries are excluded: a Send/Exchange marked "Returned to Sender"
    /// carries status ReturnedToSender plus a DeliveredAt (and a walk-in one a warehouse stamp), so
    /// it would otherwise match here AND in <see cref="BillableFailed"/> and be counted twice.
    /// </summary>
    public static IQueryable<Order> Delivered(this IQueryable<Order> orders, DateTime? from, DateTime to)
    {
        bool     hasFrom = from.HasValue;
        DateTime lo      = from ?? to; // never used when hasFrom is false; avoids an out-of-range sentinel

        return orders
            .Where(o => ((o.Status == OrderStatus.DeliveredToRecipient
                          || o.Status == OrderStatus.ExchangeCompleted
                          // An Exchange finalized as ReturnedToSender is still dated by its
                          // delivery event (it has no warehouse drop-off timestamp).
                          || (o.OrderType == OrderType.Exchange && o.Status == OrderStatus.ReturnedToSender))
                         && o.DeliveredAt < to && (!hasFrom || o.DeliveredAt >= lo))
                     || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                          || o.Status == OrderStatus.ReturnedToSender)
                         && o.DeliveredToWarehouseAt < to && (!hasFrom || o.DeliveredToWarehouseAt >= lo)))
            .Where(IsNotBillableFailed);
    }

    /// <summary>
    /// Billable failed deliveries dated by the billing event (<c>DeliveredAt ?? CancelledAt</c>,
    /// i.e. <c>OrderFinance.FailedDeliveryEventAt</c>) in [from, to). They earn the company fee
    /// (shifted to the sender) and the courier their salary though no COD changes hands.
    /// </summary>
    public static IQueryable<Order> BillableFailed(this IQueryable<Order> orders, DateTime? from, DateTime to)
    {
        bool     hasFrom = from.HasValue;
        DateTime lo      = from ?? to;

        return orders
            .Where(IsBillableFailed)
            .Where(o => (o.DeliveredAt ?? o.CancelledAt) < to
                     && (!hasFrom || (o.DeliveredAt ?? o.CancelledAt) >= lo));
    }

    /// <summary>
    /// Loads only the columns the cumulative cash-position figures need, as untracked slim
    /// <see cref="Order"/> instances, so <c>OrderFinance</c> stays the single source of truth for the
    /// formulas while the database ships ~15 narrow columns per row instead of the whole wide row
    /// (addresses, notes, …). The overview reads every order delivered up to its end date, so row
    /// width is what costs.
    /// <para><b>Keep in step with <c>OrderFinance</c>:</b> the overview calls <c>CompanyNetCash</c>,
    /// <c>SenderServiceShare</c> and <c>OutstandingCourierRemittance</c> (and through them
    /// <c>ServiceInflow</c>, <c>ExpectedCourierCash</c>, <c>IsBillableFailedDelivery</c>,
    /// <c>RecipientFeePortion</c>) plus raw sums of the settlement columns. If any of those starts
    /// reading another <see cref="Order"/> field, add it here, or it silently reads its default.</para>
    /// </summary>
    public static IQueryable<Order> CashPositionFields(this IQueryable<Order> orders) =>
        orders.Select(o => new Order
        {
            Id                                       = o.Id,
            // Required members — not read by any finance formula.
            TrackingNumber                           = string.Empty,
            RecipientName                            = string.Empty,
            RecipientPhone                           = string.Empty,
            RecipientCity                            = string.Empty,
            RecipientDistrict                        = string.Empty,
            RecipientAddress                         = string.Empty,

            OrderType                                = o.OrderType,
            Status                                   = o.Status,
            CancellationReason                       = o.CancellationReason,
            DeliveredAt                              = o.DeliveredAt,
            DeliveredToWarehouseAt                   = o.DeliveredToWarehouseAt,
            WhoPaysForCompanyService                 = o.WhoPaysForCompanyService,
            CompanyServicePrice                      = o.CompanyServicePrice,
            CustomerSurcharge                        = o.CustomerSurcharge,
            AmountToCollectForPackage                = o.AmountToCollectForPackage,
            CourierSalary                            = o.CourierSalary,
            CourierSalaryPaidAmount                  = o.CourierSalaryPaidAmount,
            CodTransferedToCompanyByCourier          = o.CodTransferedToCompanyByCourier,
            CodPaidToCustomerAmount                  = o.CodPaidToCustomerAmount,
            ServicePaidByCustomerAmount              = o.ServicePaidByCustomerAmount,
            IsCourierSalaryIncludedSpecialCase       = o.IsCourierSalaryIncludedSpecialCase,
            IsCompanyServicePriceIncludedSpecialCase = o.IsCompanyServicePriceIncludedSpecialCase,
        });

    /// <summary>
    /// Sender-paid service fees collected in ADVANCE on accepted-but-undelivered orders — cash
    /// already in hand, so it counts toward the cash position (not the profit block).
    /// </summary>
    public static IQueryable<Order> PrepaidUndelivered(this IQueryable<Order> orders, DateTime to) =>
        orders.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender
                       && o.ServicePaidByCustomerAmount != null
                       && o.ServicePaidByCustomerAt < to
                       && o.Status != OrderStatus.Pending
                       && o.Status != OrderStatus.CancelledByAdmin
                       && o.Status != OrderStatus.CancelledBySender
                       && o.Status != OrderStatus.OrderNotAccepted
                       // Not yet delivered → disjoint from Delivered (no double count).
                       && o.Status != OrderStatus.DeliveredToRecipient
                       && o.Status != OrderStatus.ExchangeCompleted
                       && o.Status != OrderStatus.DeliveredReturnOrderToWarehouse
                       && o.Status != OrderStatus.ReturnedToSender);
}
