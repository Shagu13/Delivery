using Application.CompanyFinance.DTOs;
using Application.Common.Interfaces;
using Application.Finance;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyFinance.Queries;

/// <summary>
/// Company-wide finance overview for [From, To] (both inclusive), computed live
/// from delivered orders. Aligned with the CourierSettlement delivered-set so the
/// figures reconcile with the sum of courier settlements over the same period.
/// The live cash position additionally folds in sender service fees paid in advance
/// on accepted-but-undelivered orders, since that cash is already in hand.
/// </summary>
/// <summary>
/// <paramref name="Cities"/>/<paramref name="Districts"/> optionally scope every figure to
/// orders whose recipient location matches: recipient city is one of <paramref name="Cities"/>
/// (if any given) AND recipient district is one of <paramref name="Districts"/> (if any given).
/// Both empty = no narrowing. Mirrors GetAllGroupOrdersQueryHandler's facet-style filtering.
/// </summary>
public sealed record GetCompanyFinanceOverviewQuery(
    DateOnly From,
    DateOnly To,
    IReadOnlyList<string>? Cities = null,
    IReadOnlyList<string>? Districts = null
) : IRequest<CompanyFinanceOverviewDto>;

public sealed class GetCompanyFinanceOverviewQueryHandler
    : IRequestHandler<GetCompanyFinanceOverviewQuery, CompanyFinanceOverviewDto>
{
    private readonly IAppDbContext _context;
    public GetCompanyFinanceOverviewQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CompanyFinanceOverviewDto> Handle(
        GetCompanyFinanceOverviewQuery request,
        CancellationToken cancellationToken)
    {
        var fromDt = request.From.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
        var toDt   = request.To.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc); // exclusive upper bound

        // Optional recipient-location narrowing: city facet AND district facet, each applied
        // only when non-empty (mirrors GetAllGroupOrdersQueryHandler's multi-select filters).
        HashSet<string> cities = (request.Cities ?? Array.Empty<string>())
            .Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).ToHashSet();
        HashSet<string> districts = (request.Districts ?? Array.Empty<string>())
            .Where(d => !string.IsNullOrWhiteSpace(d)).Select(d => d.Trim()).ToHashSet();

        System.Linq.Expressions.Expression<Func<Domain.Order, bool>> inArea = o =>
            (cities.Count == 0 || cities.Contains(o.RecipientCity!))
            && (districts.Count == 0 || districts.Contains(o.RecipientDistrict!));

        // Delivered orders for the range — same definition as CourierSettlement:
        // last-mile deliveries (DeliveredAt) and return drop-offs (DeliveredToWarehouseAt).
        // Includes the admin-set final terminal statuses (ExchangeCompleted, ReturnedToSender)
        // so finalized Exchange/Return orders stay counted, dated by the courier's delivery event.
        var delivered = _context.Orders
            .AsNoTracking()
            .Where(o => ((o.Status == OrderStatus.DeliveredToRecipient
                          || o.Status == OrderStatus.ExchangeCompleted)
                         && o.DeliveredAt >= fromDt && o.DeliveredAt < toDt)
                     || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                          || o.Status == OrderStatus.ReturnedToSender)
                         && o.DeliveredToWarehouseAt >= fromDt && o.DeliveredToWarehouseAt < toDt))
            .Where(inArea);

        // Billable failed deliveries in range (mirrors OrderFinance.IsBillableFailedDelivery;
        // inlined because this runs in SQL). Dated by the billing event = DeliveredAt ?? CancelledAt.
        // The signal is an explicit (non-warehouse) CancellationReason set by the courier/admin
        // when they cancel-and-charge or return-to-sender. They earn the company service fee
        // (shifted to the sender) and the courier their salary, though no COD or recipient cash
        // changes hands — disjoint from the delivered set above.
        var billableFailed = _context.Orders
            .AsNoTracking()
            .Where(o => o.OrderType != OrderType.Return
                     && o.CancellationReason != null
                     && o.CancellationReason != CancellationReason.WarehouseNotReceived
                     && o.CancellationReason != CancellationReason.DidNotWant
                     && (o.DeliveredAt ?? o.CancelledAt) >= fromDt
                     && (o.DeliveredAt ?? o.CancelledAt) < toDt)
            .Where(inArea);

        var ordersDelivered = await delivered.CountAsync(cancellationToken);

        var serviceRevenue = (await delivered
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m)
          + (await billableFailed
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m);

        // Failed deliveries' fees are always invoiced to the sender (recipient paid nothing),
        // so they add to serviceRevenue but never to serviceCollectedFromRecipient.
        var serviceCollectedFromRecipient = await delivered
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m;

        var courierSalary = (await delivered
            .SumAsync(o => o.CourierSalary, cancellationToken) ?? 0m)
          + (await billableFailed
            .SumAsync(o => o.CourierSalary, cancellationToken) ?? 0m);

        var codPassThrough = await delivered
            .SumAsync(o => o.AmountToCollectForPackage, cancellationToken) ?? 0m;

        // ── Cash position (actual money) as of To, derived live from delivered orders ──
        // The per-order settlement fields are the source of truth (the CourierSettlement /
        // CustomerSettlement tables were removed). Cumulative: every order delivered up to
        // To, using the same delivered-set definition as above but with no lower bound.
        var deliveredUpTo = await _context.Orders
            .AsNoTracking()
            .Where(o => ((o.Status == OrderStatus.DeliveredToRecipient
                          || o.Status == OrderStatus.ExchangeCompleted)
                         && o.DeliveredAt < toDt)
                     || ((o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
                          || o.Status == OrderStatus.ReturnedToSender)
                         && o.DeliveredToWarehouseAt < toDt))
            .Where(inArea)
            .ToListAsync(cancellationToken);

        var senderUpTo = deliveredUpTo.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender).ToList();

        // Sender-paid service fees collected in ADVANCE on orders that are accepted but not
        // yet delivered (so absent from the delivered set above). Customers often pre-pay;
        // that cash is in the company's hands now, so it counts toward the live cash position
        // and the "service paid by senders" figure even though delivery is still pending.
        // COD / salary cash on these orders is still zero (nothing collected before delivery),
        // so only the service inflow / receivable is affected.
        var prepaidUndelivered = await _context.Orders
            .AsNoTracking()
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender
                     && o.ServicePaidByCustomerAmount != null
                     && o.ServicePaidByCustomerAt < toDt
                     && o.Status != OrderStatus.Pending
                     && o.Status != OrderStatus.CancelledByAdmin
                     && o.Status != OrderStatus.CancelledBySender
                     && o.Status != OrderStatus.OrderNotAccepted
                     // Not yet delivered → disjoint from the delivered set above (no double
                     // count), and its CompanyNetCash is purely the service inflow.
                     && o.Status != OrderStatus.DeliveredToRecipient
                     && o.Status != OrderStatus.ExchangeCompleted
                     && o.Status != OrderStatus.DeliveredReturnOrderToWarehouse
                     && o.Status != OrderStatus.ReturnedToSender)
            .Where(inArea)
            .ToListAsync(cancellationToken);

        // Billable failed deliveries cumulative to To (same definition as billableFailed, no
        // lower bound). The sender owes the full fee and the courier their salary; no COD or
        // recipient cash was collected, so those terms are zero. Disjoint from deliveredUpTo
        // and prepaidUndelivered (their statuses are excluded from both).
        var billableFailedUpTo = await _context.Orders
            .AsNoTracking()
            .Where(o => o.OrderType != OrderType.Return
                     && o.CancellationReason != null
                     && o.CancellationReason != CancellationReason.WarehouseNotReceived
                     && o.CancellationReason != CancellationReason.DidNotWant
                     && (o.DeliveredAt ?? o.CancelledAt) < toDt)
            .Where(inArea)
            .ToListAsync(cancellationToken);

        var cashInFromCouriers       = deliveredUpTo.Sum(o => o.CodTransferedToCompanyByCourier ?? 0m)
                                     + billableFailedUpTo.Sum(o => o.CodTransferedToCompanyByCourier ?? 0m);
        var salaryPaidToCouriers     = deliveredUpTo.Sum(o => o.CourierSalaryPaidAmount ?? 0m)
                                     + billableFailedUpTo.Sum(o => o.CourierSalaryPaidAmount ?? 0m);
        var salaryEarned             = deliveredUpTo.Sum(o => o.CourierSalary ?? 0m)
                                     + billableFailedUpTo.Sum(o => o.CourierSalary ?? 0m);
        var senderServicePaid        = senderUpTo.Sum(o => o.ServicePaidByCustomerAmount ?? 0m)
                                     + prepaidUndelivered.Sum(o => o.ServicePaidByCustomerAmount ?? 0m)
                                     + billableFailedUpTo.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);
        var codPaidToCustomers       = deliveredUpTo.Sum(o => o.CodPaidToCustomerAmount ?? 0m);
        var codCollectedForCustomers = deliveredUpTo.Sum(o => o.AmountToCollectForPackage ?? 0m);
        // Include the prepaid orders' obligation too, so the receivable nets correctly
        // (a fully pre-paid undelivered order is owed == paid → contributes 0 outstanding).
        // Failed deliveries add their full fee as a sender receivable.
        var serviceOwedByCustomers   = senderUpTo.Sum(o => o.CompanyServicePrice)
                                     + prepaidUndelivered.Sum(o => o.CompanyServicePrice)
                                     + billableFailedUpTo.Sum(o => o.CompanyServicePrice);
        // What couriers still have to send in for delivered orders: cash they were expected to
        // collect, less what they've transferred and any salary they kept out of it. Billable
        // failed deliveries never contribute (the courier collected no cash on those).
        var outstandingCourierRemittance = deliveredUpTo.Sum(OrderFinance.OutstandingCourierRemittance);

        // Exact net cash via the single canonical per-order formula. Advance service
        // payments add their service inflow (COD/salary terms are zero pre-delivery); failed
        // deliveries contribute their service inflow minus any salary already paid out.
        var netCashPosition = deliveredUpTo.Sum(OrderFinance.CompanyNetCash)
                            + prepaidUndelivered.Sum(OrderFinance.CompanyNetCash)
                            + billableFailedUpTo.Sum(OrderFinance.CompanyNetCash);

        return new CompanyFinanceOverviewDto(
            From:                        request.From.ToString("yyyy-MM-dd"),
            To:                          request.To.ToString("yyyy-MM-dd"),
            OrdersDelivered:             ordersDelivered,
            ServiceRevenue:              serviceRevenue,
            ServiceCollectedFromRecipient: serviceCollectedFromRecipient,
            ServiceInvoicedToSenders:    serviceRevenue - serviceCollectedFromRecipient,
            CourierSalary:               courierSalary,
            NetOperatingMargin:          serviceRevenue - courierSalary,
            CodPassThrough:              codPassThrough,
            CashInFromCouriers:          cashInFromCouriers,
            SenderServicePaid:           senderServicePaid,
            CodPaidToCustomers:          codPaidToCustomers,
            SalaryPaidToCouriers:        salaryPaidToCouriers,
            NetCashPosition:             netCashPosition,
            OutstandingCodOwedToCustomers: codCollectedForCustomers - codPaidToCustomers,
            OutstandingServiceReceivable:  serviceOwedByCustomers - senderServicePaid,
            OutstandingSalaryOwed:         salaryEarned - salaryPaidToCouriers,
            OutstandingCourierRemittance:  outstandingCourierRemittance
        );
    }
}
