namespace Application.CompanyFinance.DTOs;

/// <summary>
/// Live company finance overview for a date range, derived directly from delivered
/// orders (the single source of truth). Service revenue is counted once per
/// delivered order via CompanyServicePrice, independent of payer; the payer only
/// splits it into the cash-collected slice vs. the sender-invoiced receivable.
/// COD is pass-through (customer money) and is reported for reconciliation only —
/// it is never part of revenue.
/// </summary>
public sealed record CompanyFinanceOverviewDto(
    string  From,                          // ISO date (inclusive)
    string  To,                            // ISO date (inclusive)

    int     OrdersDelivered,

    decimal ServiceRevenue,                // Σ CompanyServicePrice (all payers)
    decimal ServiceCollectedByRecipient,   // cash slice (collected by courier at delivery)
    decimal ServiceInvoicedToSenders,      // receivable slice (= revenue − recipient slice)

    decimal CourierSalary,                 // Σ CourierSalary (direct cost)
    decimal NetOperatingMargin,            // ServiceRevenue − CourierSalary

    decimal CodPassThrough                 // Σ AmountToCollectForPackage (NOT revenue)
);
