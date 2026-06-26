namespace Application.Settlements.DTOs;

/// <summary>
/// A courier's day summary, derived live by grouping the courier's delivered orders by
/// delivery day (no stored settlement row exists any more). Financial fields are read-only.
/// </summary>
public sealed record CourierSettlementItemDto(
    string  Date,                            // "YYYY-MM-DD" (delivery day)
    int     TotalOrdersPickedUp,
    int     TotalOrdersDelivered,
    int     NumberOfOrdersCancelled,         // orders cancelled on this day
    int     NumberOfOrderPostponed,          // orders postponed on this day
    decimal TotalAmountOfCashCollected,      // Σ AmountOfCashCollected (cash from recipients)
    decimal TotalCompanyServiceRevenue,      // Σ CompanyServicePrice
    decimal TotalCourierSalary,              // Σ CourierSalary (earned)
    decimal TotalCourierSalaryPaid,          // Σ CourierSalaryPaidAmount (credited)
    decimal TotalCourierTransferToCompany,   // Σ CodTransferedToCompanyByCourier (handed over)
    decimal TotalCompanyNetIncome            // Σ OrderFinance.CompanyNetCash
);
