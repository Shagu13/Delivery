using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>
/// The co-admin (TenantAdmin) finance snapshot, computed live from the tenant's orders.
/// No markup (v1) → the same Order.CompanyServicePrice drives both tiers, so all figures
/// derive from the tenant's active (non-cancelled) orders plus recorded payments:
///   • sub-customer tier (livo ↔ its customers): per-order payment fields
///     (CodPaidToCustomerAmount / ServicePaidByCustomerAmount);
///   • dilo tier (livo ↔ company): payment accumulators on TenantSettlement.
/// Scoped strictly to <paramref name="TenantId"/> (from the JWT claim).
/// </summary>
public sealed record GetTenantFinanceOverviewQuery(Guid TenantId)
    : IRequest<TenantFinanceOverviewDto>;

public sealed record TenantFinanceOverviewDto(
    decimal TenantOwesCompany,        // service fees livo owes dilo (net of livo→dilo payments)
    decimal CompanyOwesTenant,        // COD dilo collected, owed to livo (net of dilo→livo payments)
    decimal TenantOwesCustomers,      // COD livo owes its sub-customers (net of livo→customer payments)
    decimal CustomersOweTenant,       // service fees sub-customers owe livo (net of customer→livo payments)
    decimal GrossCodCollected,        // Σ COD over active orders
    decimal GrossServiceSenderPays,   // Σ sender-paid service fee over active orders
    int     OrdersDelivered,
    int     OrdersActive);

public sealed class GetTenantFinanceOverviewQueryHandler
    : IRequestHandler<GetTenantFinanceOverviewQuery, TenantFinanceOverviewDto>
{
    private static readonly OrderStatus[] Cancelled =
    {
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        OrderStatus.OrderNotAccepted,
    };

    private static readonly OrderStatus[] Delivered =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.ExchangeCompleted,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
    };

    private readonly IAppDbContext _context;
    public GetTenantFinanceOverviewQueryHandler(IAppDbContext context) => _context = context;

    public async Task<TenantFinanceOverviewDto> Handle(
        GetTenantFinanceOverviewQuery request, CancellationToken cancellationToken)
    {
        var tid = request.TenantId;

        // The tenant's orders via either ownership path (batch → customer, or standalone Return),
        // excluding cancelled ones — mirrors CustomerSettlementService's "active" set.
        var rows = await _context.Orders
            .Where(o =>
                (o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == tid)
                || (o.Customer != null && o.Customer.TenantId == tid))
            .Where(o => !Cancelled.Contains(o.Status))
            .Select(o => new
            {
                o.Status,
                o.AmountToCollectForPackage,
                o.CodPaidToCustomerAmount,
                o.WhoPaysForCompanyService,
                o.CompanyServicePrice,
                o.ServicePaidByCustomerAmount,
            })
            .ToListAsync(cancellationToken);

        decimal grossCod           = rows.Sum(o => o.AmountToCollectForPackage ?? 0m);
        decimal codPaidToCustomers = rows.Sum(o => o.CodPaidToCustomerAmount ?? 0m);

        var senderPays = rows.Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender).ToList();
        decimal grossService          = senderPays.Sum(o => o.CompanyServicePrice);
        decimal servicePaidByCustomers = senderPays.Sum(o => o.ServicePaidByCustomerAmount ?? 0m);

        int ordersDelivered = rows.Count(o => Delivered.Contains(o.Status));

        // Dilo-tier payments recorded so far (summed across the tenant's monthly settlement rows).
        var settlements = await _context.TenantSettlements
            .Where(s => s.TenantId == tid)
            .Select(s => new { s.TotalAmountOfCollectedCodPaidToTenant, s.TotalAmountPaidToCompanyForCompanyService })
            .ToListAsync(cancellationToken);

        decimal codPaidByCompany    = settlements.Sum(s => s.TotalAmountOfCollectedCodPaidToTenant);
        decimal servicePaidToCompany = settlements.Sum(s => s.TotalAmountPaidToCompanyForCompanyService);

        return new TenantFinanceOverviewDto(
            TenantOwesCompany:      grossService - servicePaidToCompany,
            CompanyOwesTenant:      grossCod     - codPaidByCompany,
            TenantOwesCustomers:    grossCod     - codPaidToCustomers,
            CustomersOweTenant:     grossService - servicePaidByCustomers,
            GrossCodCollected:      grossCod,
            GrossServiceSenderPays: grossService,
            OrdersDelivered:        ordersDelivered,
            OrdersActive:           rows.Count);
    }
}
