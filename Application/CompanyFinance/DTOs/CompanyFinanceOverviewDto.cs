namespace Application.CompanyFinance.DTOs;

/// <summary>
/// Company finance overview. Two distinct views are bundled together:
///
/// 1. Profit (accrual) — derived live from delivered orders in [From, To].
///    Service revenue is counted once per delivered order via CompanyServicePrice,
///    independent of payer; the payer only splits it into the cash-collected slice
///    vs. the sender-invoiced receivable. COD is pass-through (customer money) and
///    is reported for reconciliation only — never part of revenue.
///
/// 2. Cash position (actual money) — derived from the settlement tables, which hold
///    the real payment facts orders cannot know. This is the net cash from operations
///    as of <see cref="To"/> (all settlements up to that date, so it is independent of
///    <see cref="From"/>). Courier-side movements are dated by CourierSettlement.CreatedAt;
///    customer-side movements are bucketed by the settlement's calendar month, so a
///    partial end month is included whole.
/// </summary>
public sealed record CompanyFinanceOverviewDto(
    string  From,                          // ISO date (inclusive) — scopes the profit block
    string  To,                            // ISO date (inclusive) — also the "as of" for the cash block

    int     OrdersDelivered,

    // ── Profit (accrual, from delivered orders in [From, To]) ──────────────────
    decimal ServiceRevenue,                // Σ CompanyServicePrice (all payers)
    decimal ServiceCollectedFromRecipient, // cash slice (collected by courier at delivery)
    decimal ServiceInvoicedToSenders,      // receivable slice (= revenue − recipient slice)
    decimal CourierSalary,                 // Σ CourierSalary (direct cost)
    decimal NetOperatingMargin,            // ServiceRevenue − CourierSalary
    decimal CodPassThrough,                // Σ AmountToCollectForPackage (NOT revenue)

    // ── Cash position (actual money, from settlements, as of To) ───────────────
    decimal CashInFromCouriers,            // Σ CourierSettlement.TotalAmountOfCashCollected
    decimal SenderServicePaid,             // Σ CustomerSettlement.TotalAmountPaidToCompanyForCompanyService
    decimal CodPaidToCustomers,            // Σ CustomerSettlement.TotalAmountOfCollectedCodPaidByCompany
    decimal SalaryPaidToCouriers,          // Σ CourierSettlement.AmountCourierWasPaid
    decimal NetCashPosition,               // CashIn + SenderServicePaid − CodPaidOut − SalaryPaid

    // ── Outstanding balances (as of To) ───────────────────────────────────────
    decimal OutstandingCodOwedToCustomers, // COD collected but not yet paid back (company owes)
    decimal OutstandingServiceReceivable,  // sender service fees owed but not yet paid (owed to company)
    decimal OutstandingSalaryOwed,         // courier salary earned but not yet paid (company owes)
    decimal OutstandingCourierRemittance   // cash couriers still have to send in (owed to company)
);
