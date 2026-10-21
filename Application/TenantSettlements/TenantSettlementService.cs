using Application.Common.Interfaces;
using Application.Finance;
using Application.TenantSettlements.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.TenantSettlements;

/// <summary>
/// Shared compute + upsert + mapping for the monthly tenant ↔ company (dilo) settlement.
/// One row per tenant per calendar month. The aggregate figures are derived from the
/// tenant's orders DELIVERED in that month (settlement basis); the payment accumulators
/// are recorded by a dilo-admin and preserved across recomputes.
/// The tenant↔company tier (one level up from the company↔customer per-order settlement).
/// </summary>
internal static class TenantSettlementService
{
    private static readonly OrderStatus[] Delivered =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.ExchangeCompleted,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
    };

    /// <summary>
    /// Creates or refreshes the (tenant, year, month) row's order-derived aggregates,
    /// leaving the payment accumulators untouched. Returns the tracked row.
    /// </summary>
    public static async Task<TenantSettlement> EnsureAndRecomputeAsync(
        IAppDbContext context, Guid tenantId, int year, int month, CancellationToken ct)
    {
        var rows = await context.Orders
            .Where(o =>
                (o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == tenantId)
                || (o.Customer != null && o.Customer.TenantId == tenantId))
            .Select(o => new
            {
                o.Status,
                o.AmountToCollectForPackage,
                o.WhoPaysForCompanyService,
                o.CompanyServicePrice,
                o.CustomerSurcharge,
                o.CodPaidToTenantAmount,
                o.ServicePaidByTenantAmount,
                o.DeliveredAt,
                o.DeliveredToWarehouseAt,
            })
            .ToListAsync(ct);

        var deliveredInMonth = rows
            .Where(o => Delivered.Contains(o.Status))
            .Where(o =>
            {
                var d = o.DeliveredAt ?? o.DeliveredToWarehouseAt;
                return d.HasValue && d.Value.Year == year && d.Value.Month == month;
            })
            .ToList();

        decimal cod = deliveredInMonth.Sum(o => o.AmountToCollectForPackage ?? 0m);
        // The tenant owes dilo its share of each fee: the whole fee on sender-pays orders, only the
        // customer surcharge on recipient-pays ones (0 for an ordinary recipient-pays order).
        var senderOwes  = deliveredInMonth
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender
                     || OrderFinance.SenderServiceShareOf(o.WhoPaysForCompanyService, o.CompanyServicePrice, o.CustomerSurcharge) > 0m)
            .ToList();
        decimal service = senderOwes.Sum(o => OrderFinance.SenderServiceShareOf(o.WhoPaysForCompanyService, o.CompanyServicePrice, o.CustomerSurcharge));
        // Payments derived from the per-order dilo↔tenant fields (admin settlement sheet).
        decimal codPaid     = deliveredInMonth.Sum(o => o.CodPaidToTenantAmount ?? 0m);
        decimal servicePaid = senderOwes.Sum(o => o.ServicePaidByTenantAmount ?? 0m);

        var settlement = await context.TenantSettlements
            .FirstOrDefaultAsync(s => s.TenantId == tenantId && s.Year == year && s.Month == month, ct);

        if (settlement is null)
        {
            settlement = new TenantSettlement
            {
                TenantId                                  = tenantId,
                Year                                      = year,
                Month                                     = month,
                TotalNumberOfOrdersPlaced                 = deliveredInMonth.Count,
                TotalNumberOfOrderDelivered               = deliveredInMonth.Count,
                TotalCODCompanyCollectedForTenant         = cod,
                TotalCompanyServicePriceOwedByTenant      = service,
                TotalAmountOfCollectedCodPaidToTenant     = codPaid,
                TotalAmountPaidToCompanyForCompanyService = servicePaid,
            };
            context.TenantSettlements.Add(settlement);
        }
        else
        {
            settlement.TotalNumberOfOrdersPlaced                 = deliveredInMonth.Count;
            settlement.TotalNumberOfOrderDelivered               = deliveredInMonth.Count;
            settlement.TotalCODCompanyCollectedForTenant         = cod;
            settlement.TotalCompanyServicePriceOwedByTenant      = service;
            settlement.TotalAmountOfCollectedCodPaidToTenant     = codPaid;
            settlement.TotalAmountPaidToCompanyForCompanyService = servicePaid;
            settlement.UpdatedAt                                 = CustomTime.Now;
        }

        await context.SaveChangesAsync(ct);
        return settlement;
    }

    public static TenantSettlementDto ToDto(TenantSettlement s, string tenantDisplayName) => new(
        Id:                                        s.Id,
        TenantId:                                  s.TenantId,
        TenantDisplayName:                         tenantDisplayName,
        Year:                                      s.Year,
        Month:                                     s.Month,
        TotalNumberOfOrdersPlaced:                 s.TotalNumberOfOrdersPlaced,
        TotalNumberOfOrderDelivered:               s.TotalNumberOfOrderDelivered,
        TotalCODCompanyCollectedForTenant:         s.TotalCODCompanyCollectedForTenant,
        TotalAmountOfCollectedCodPaidToTenant:     s.TotalAmountOfCollectedCodPaidToTenant,
        AmountOfCollectedCodPaidToTenant:          s.AmountOfCollectedCodPaidToTenant,
        OutstandingCodOwedToTenant:                s.TotalCODCompanyCollectedForTenant - s.TotalAmountOfCollectedCodPaidToTenant,
        TotalCompanyServicePriceOwedByTenant:      s.TotalCompanyServicePriceOwedByTenant,
        TotalAmountPaidToCompanyForCompanyService: s.TotalAmountPaidToCompanyForCompanyService,
        AmountPaidToCompanyForCompanyService:      s.AmountPaidToCompanyForCompanyService,
        OutstandingServiceOwedByTenant:            s.TotalCompanyServicePriceOwedByTenant - s.TotalAmountPaidToCompanyForCompanyService,
        UpdatedAt:                                 s.UpdatedAt?.ToString("o"));
}
