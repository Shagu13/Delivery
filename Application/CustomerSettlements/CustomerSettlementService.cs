using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Domain;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements;

/// <summary>
/// Shared computation + mapping for customer monthly settlements, so the create,
/// recompute and preview handlers stay in lock-step.
/// </summary>
internal static class CustomerSettlementService
{
    /// <summary>The four order-derived figures for a customer in a given month.</summary>
    public readonly record struct MonthlyFigures(
        int OrdersPlaced,
        int OrdersDelivered,
        decimal CodCollectedForPackages,
        decimal CompanyServicePriceOwed);

    /// <summary>UTC [start, end) bounds for the given calendar month.</summary>
    public static (DateTime Start, DateTime End) MonthBounds(int year, int month)
    {
        var start = new DateTime(year, month, 1, 0, 0, 0, DateTimeKind.Utc);
        return (start, start.AddMonths(1));
    }

    /// <summary>
    /// Computes orders placed/delivered, COD collected and service owed for the
    /// customer's orders in the month. Customer ownership spans both paths:
    /// Send/Exchange via GroupOrder.CustomerId, standalone Return via Order.CustomerId.
    /// COD and service are summed over Send/Exchange orders delivered in the month;
    /// service is only owed when the sender (customer) pays the fee.
    /// </summary>
    public static async Task<MonthlyFigures> ComputeAsync(
        IAppDbContext context,
        Guid customerId,
        int year,
        int month,
        CancellationToken ct)
    {
        var (monthStart, monthEnd) = MonthBounds(year, month);

        var ordersPlaced = await context.Orders
            .CountAsync(o => (o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId)
                          && o.CreatedAt >= monthStart
                          && o.CreatedAt <  monthEnd,
                        ct);

        var delivered = await context.Orders
            .AsNoTracking()
            .Where(o => (o.GroupOrder!.CustomerId == customerId || o.CustomerId == customerId)
                     && (o.Status == OrderStatus.DeliveredToRecipient || o.Status == OrderStatus.ExchangeCompleted)
                     && o.DeliveredAt >= monthStart
                     && o.DeliveredAt <  monthEnd)
            .Select(o => new
            {
                o.AmountToCollectForPackage,
                o.CompanyServicePrice,
                o.WhoPaysForCompanyService,
            })
            .ToListAsync(ct);

        var cod = delivered.Sum(o => o.AmountToCollectForPackage ?? 0m);
        var service = delivered
            .Where(o => o.WhoPaysForCompanyService == ServicePayer.Sender)
            .Sum(o => o.CompanyServicePrice);

        return new MonthlyFigures(ordersPlaced, delivered.Count, cod, service);
    }

    /// <summary>
    /// Creates or updates the customer's settlement for the month of the delivered order.
    /// Resolves the customer via GroupOrder.CustomerId (Send/Exchange) or Order.CustomerId (Return).
    /// </summary>
    public static async Task UpsertAsync(IAppDbContext context, Order order, CancellationToken ct)
    {
        Guid customerId;
        if (order.GroupOrderId.HasValue)
        {
            var groupCustomerId = await context.GroupOrders
                .Where(g => g.Id == order.GroupOrderId.Value)
                .Select(g => (Guid?)g.CustomerId)
                .FirstOrDefaultAsync(ct);
            if (groupCustomerId == null) return;
            customerId = groupCustomerId.Value;
        }
        else if (order.CustomerId.HasValue)
        {
            customerId = order.CustomerId.Value;
        }
        else return;

        var deliveredAt = order.DeliveredAt!.Value;
        int year  = deliveredAt.Year;
        int month = deliveredAt.Month;

        var figures = await ComputeAsync(context, customerId, year, month, ct);

        var existing = await context.CustomerSettlements
            .FirstOrDefaultAsync(s => s.CustomerId == customerId
                                   && s.Year  == year
                                   && s.Month == month, ct);

        if (existing == null)
        {
            context.CustomerSettlements.Add(new CustomerSettlement
            {
                CustomerId                            = customerId,
                Year                                  = year,
                Month                                 = month,
                TotalNumberOfOrdersPlaced             = figures.OrdersPlaced,
                TotalNumberOfOrderDelivered           = figures.OrdersDelivered,
                TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages,
                TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed,
                CreatedAt                             = DateTime.UtcNow,
            });
        }
        else
        {
            existing.TotalNumberOfOrdersPlaced             = figures.OrdersPlaced;
            existing.TotalNumberOfOrderDelivered           = figures.OrdersDelivered;
            existing.TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages;
            existing.TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed;
            existing.UpdatedAt                             = DateTime.UtcNow;
        }

        await context.SaveChangesAsync(ct);
    }

    /// <summary>Maps a stored settlement row to its DTO, deriving outstanding balances.</summary>
    public static CustomerSettlementDto ToDto(CustomerSettlement s, string businessName) =>
        new(
            Id:                                        s.Id,
            CustomerId:                                s.CustomerId,
            CustomerBusinessName:                      businessName,
            Year:                                      s.Year,
            Month:                                     s.Month,
            TotalNumberOfOrdersPlaced:                 s.TotalNumberOfOrdersPlaced,
            TotalNumberOfOrderDelivered:               s.TotalNumberOfOrderDelivered,
            TotalCODCompanyCollectedForPackages:       s.TotalCODCompanyCollectedForPackages,
            TotalAmountOfCollectedCodPaidByCompany:    s.TotalAmountOfCollectedCodPaidByCompany,
            AmountOfCollectedCodPaidByCompany:         s.AmountOfCollectedCodPaidByCompany,
            OutstandingCodOwedToCustomer:              s.TotalCODCompanyCollectedForPackages - s.TotalAmountOfCollectedCodPaidByCompany,
            TotalCompanyServicePriceOwedToCompany:     s.TotalCompanyServicePriceOwedToCompany,
            TotalAmountPaidToCompanyForCompanyService: s.TotalAmountPaidToCompanyForCompanyService,
            AmountPaidToCompanyForCompanyService:      s.AmountPaidToCompanyForCompanyService,
            OutstandingServiceOwedToCompany:           s.TotalCompanyServicePriceOwedToCompany - s.TotalAmountPaidToCompanyForCompanyService,
            CreatedAt:                                 s.CreatedAt.ToString("o"),
            UpdatedAt:                                 s.UpdatedAt?.ToString("o")
        );
}
