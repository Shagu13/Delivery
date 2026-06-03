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

        var serviceCollectedByRecipient = await delivered
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Recipient)
            .SumAsync(o => (decimal?)o.CompanyServicePrice, cancellationToken) ?? 0m;

        var courierSalary = await delivered
            .SumAsync(o => o.CourierSalary, cancellationToken) ?? 0m;

        var codPassThrough = await delivered
            .SumAsync(o => o.AmountToCollectForPackage, cancellationToken) ?? 0m;

        return new CompanyFinanceOverviewDto(
            From:                        request.From.ToString("yyyy-MM-dd"),
            To:                          request.To.ToString("yyyy-MM-dd"),
            OrdersDelivered:             ordersDelivered,
            ServiceRevenue:              serviceRevenue,
            ServiceCollectedByRecipient: serviceCollectedByRecipient,
            ServiceInvoicedToSenders:    serviceRevenue - serviceCollectedByRecipient,
            CourierSalary:               courierSalary,
            NetOperatingMargin:          serviceRevenue - courierSalary,
            CodPassThrough:              codPassThrough
        );
    }
}
