using Domain.Enums;

namespace Application.CompanyFinance.DTOs;

/// <summary>Which profit-block bucket of the overview an order is counted in.</summary>
public enum CompanyFinanceOrderGroup
{
    /// <summary>Delivered in range — counted in orders delivered, revenue, salary and COD.</summary>
    Delivered,
    /// <summary>Billable failed delivery in range — adds the fee and salary, no COD, not in orders delivered.</summary>
    BillableFailed,
}

/// <summary>One order behind the overview's profit figures.</summary>
public sealed record CompanyFinanceOrderDto(
    Guid                     OrderId,
    string                   TrackingNumber,
    CompanyFinanceOrderGroup Group,
    OrderType                OrderType,
    OrderStatus              Status,
    CancellationReason?      CancellationReason,
    DateTime?                EventAt,             // the date that put it in range
    string                   RecipientCity,
    string                   RecipientDistrict,
    string?                  CustomerName,
    string?                  CourierName,
    ServicePayer             WhoPaysForCompanyService,
    decimal                  ServiceFee,          // summed into ServiceRevenue
    decimal?                 CourierSalary,       // summed into CourierSalary
    decimal                  Margin,              // ServiceFee − CourierSalary; summed into NetOperatingMargin
    decimal?                 Cod                  // summed into CodPassThrough (Delivered group only)
);

/// <summary>
/// Every order behind the overview's profit block for [From, To] and the same area filter:
/// the Delivered rows add up to OrdersDelivered / CodPassThrough, and Delivered + BillableFailed
/// add up to ServiceRevenue / CourierSalary / NetOperatingMargin. The cash-position and outstanding
/// figures are cumulative from before From, so they are not itemised here.
/// </summary>
public sealed record CompanyFinanceOrdersDto(
    string                                From,
    string                                To,
    IReadOnlyList<CompanyFinanceOrderDto> Orders
);
