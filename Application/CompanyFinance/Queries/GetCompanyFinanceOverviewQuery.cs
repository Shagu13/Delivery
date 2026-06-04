using Application.CompanyFinance.DTOs;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CompanyFinance.Queries;

/// <summary>
/// Company-wide finance overview for [From, To] (both inclusive), computed live
/// from delivered orders. Aligned with the CourierSettlement delivered-set so the
/// figures reconcile with the sum of courier settlements over the same period.
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
        var delivered = _context.Orders
            .AsNoTracking()
            .Where(o => (o.Status == OrderStatus.DeliveredToRecipient
                         && o.DeliveredAt >= fromDt && o.DeliveredAt < toDt)
                     || (o.Status == OrderStatus.DeliveredReturnOrderToWarehouse
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

        // ── Cash position (actual money, from settlement tables) ───────────────
        // Net cash from operations as of To: every settlement up to that date.

        // Courier side: dated by CreatedAt up to To.
        var courierSettlements = _context.CourierSettlements
            .AsNoTracking()
            .Where(c => c.CreatedAt < toDt);

        var cashInFromCouriers = await courierSettlements
            .SumAsync(c => (decimal?)c.TotalAmountOfCashCollected, cancellationToken) ?? 0m;
        var salaryPaidToCouriers = await courierSettlements
            .SumAsync(c => (decimal?)c.AmountCourierWasPaid, cancellationToken) ?? 0m;
        var salaryEarned = await courierSettlements
            .SumAsync(c => (decimal?)c.TotalCourierSalary, cancellationToken) ?? 0m;

        // Customer side: bucketed by calendar month; include up to To's month whole.
        int toMonthOrd = request.To.Year * 12 + request.To.Month;

        var customerSettlements = _context.CustomerSettlements
            .AsNoTracking()
            .Where(s => s.Year * 12 + s.Month <= toMonthOrd);

        var senderServicePaid = await customerSettlements
            .SumAsync(s => (decimal?)s.TotalAmountPaidToCompanyForCompanyService, cancellationToken) ?? 0m;
        var codPaidToCustomers = await customerSettlements
            .SumAsync(s => (decimal?)s.TotalAmountOfCollectedCodPaidByCompany, cancellationToken) ?? 0m;
        var codCollectedForCustomers = await customerSettlements
            .SumAsync(s => (decimal?)s.TotalCODCompanyCollectedForPackages, cancellationToken) ?? 0m;
        var serviceOwedByCustomers = await customerSettlements
            .SumAsync(s => (decimal?)s.TotalCompanyServicePriceOwedToCompany, cancellationToken) ?? 0m;

        var netCashPosition = cashInFromCouriers + senderServicePaid - codPaidToCustomers - salaryPaidToCouriers;

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
