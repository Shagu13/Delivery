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
/// One recipient-area filter entry. <paramref name="District"/> null = the whole city;
/// otherwise the specific city+district.
/// </summary>
public sealed record AreaFilterSpec(string City, string? District);

/// <summary>
/// <paramref name="Areas"/> optionally scopes every figure to orders delivered to any of the
/// listed recipient locations (a city-only entry matches every district in that city). An
/// empty list = no narrowing.
/// </summary>
public sealed record GetCompanyFinanceOverviewQuery(
    DateOnly From,
    DateOnly To,
    IReadOnlyList<AreaFilterSpec>? Areas = null
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

        // Optional recipient-location narrowing over any number of areas. A city-only entry
        // matches every district in that city; a city+district entry matches only that district.
        // Encoded for SQL as two IN lists: whole-city names, and city+district pair keys joined
        // by a unit-separator control char that can't occur in a place name. Empty = no narrowing.
        const string sep = "\u001F";
        List<AreaFilterSpec> areas = (request.Areas ?? Array.Empty<AreaFilterSpec>())
            .Where(a => !string.IsNullOrWhiteSpace(a.City))
            .Select(a => new AreaFilterSpec(
                a.City.Trim(),
                string.IsNullOrWhiteSpace(a.District) ? null : a.District!.Trim()))
            .ToList();
        List<string> cityOnly = areas.Where(a => a.District is null).Select(a => a.City).ToList();
        List<string> pairKeys = areas.Where(a => a.District is not null).Select(a => a.City + sep + a.District).ToList();

        System.Linq.Expressions.Expression<Func<Domain.Order, bool>> inArea =
            areas.Count == 0
                ? o => true
                : o => cityOnly.Contains(o.RecipientCity!)
                    || pairKeys.Contains(o.RecipientCity + sep + o.RecipientDistrict);

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
