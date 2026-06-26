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
public sealed record GetCompanyFinanceOverviewQuery(
    DateOnly From,
    DateOnly To
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
                         && o.DeliveredToWarehouseAt >= fromDt && o.DeliveredToWarehouseAt < toDt));

        var ordersDelivered = await delivered.CountAsync(cancellationToken);

        var serviceRevenue = await delivered
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m;

        var serviceCollectedFromRecipient = await delivered
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m;

        var courierSalary = await delivered
            .SumAsync(o => o.CourierSalary, cancellationToken) ?? 0m;

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
            .ToListAsync(cancellationToken);

        var cashInFromCouriers       = deliveredUpTo.Sum(o => o.CodTransferedToCompanyByCourier ?? 0m);
        var salaryPaidToCouriers     = deliveredUpTo.Sum(o => o.CourierSalaryPaidAmount ?? 0m);
        var salaryEarned             = deliveredUpTo.Sum(o => o.CourierSalary ?? 0m);
        var senderServicePaid        = senderUpTo.Sum(o => o.ServicePaidByCustomerAmount ?? 0m)
                                     + prepaidUndelivered.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);
        var codPaidToCustomers       = deliveredUpTo.Sum(o => o.CodPaidToCustomerAmount ?? 0m);
        var codCollectedForCustomers = deliveredUpTo.Sum(o => o.AmountToCollectForPackage ?? 0m);
        // Include the prepaid orders' obligation too, so the receivable nets correctly
        // (a fully pre-paid undelivered order is owed == paid → contributes 0 outstanding).
        var serviceOwedByCustomers   = senderUpTo.Sum(o => o.CompanyServicePrice)
                                     + prepaidUndelivered.Sum(o => o.CompanyServicePrice);

        // Exact net cash via the single canonical per-order formula. Advance service
        // payments add their service inflow (COD/salary terms are zero pre-delivery).
        var netCashPosition = deliveredUpTo.Sum(OrderFinance.CompanyNetCash)
                            + prepaidUndelivered.Sum(OrderFinance.CompanyNetCash);

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
            OutstandingSalaryOwed:         salaryEarned - salaryPaidToCouriers
        );
    }
}
