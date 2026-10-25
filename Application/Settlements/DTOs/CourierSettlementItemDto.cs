namespace Application.Settlements.DTOs;

/// <summary>
/// A courier's day summary, derived live by grouping the courier's orders by day (no stored
/// settlement row exists any more). The day is the delivery day, or — for regional couriers
/// (<see cref="Application.Couriers.CourierDateBasisPolicy"/>) — the day the orders were assigned;
/// <see cref="DateBasis"/> says which. Financial fields are read-only.
/// </summary>
public sealed record CourierSettlementItemDto(
    string  Date,                            // "YYYY-MM-DD" (delivery day, or assignment day when DateBasis = Assigned)
    int     TotalOrdersPickedUp,
    int     TotalOrdersDelivered,
    int     NumberOfOrdersCancelled,         // orders cancelled on this day
    int     NumberOfOrderPostponed,          // orders postponed on this day
    decimal TotalAmountOfCashCollected,      // Σ AmountOfCashCollected (cash from recipients)
    decimal TotalCompanyServiceRevenue,      // Σ CompanyServicePrice
    decimal TotalCourierSalary,              // Σ CourierSalary (earned)
    decimal TotalCourierSalaryPaid,          // Σ CourierSalaryPaidAmount (credited)
    decimal TotalCourierTransferToCompany,   // OrderFinance.CourierNetCashDue = cash collected − all salary earned (matches admin settlement modal)
    decimal TotalCompanyNetIncome,           // Σ OrderFinance.CompanyRevenue (fees − salary)
    string  DateBasis,                       // "Delivered" | "Assigned" — which date `Date` is
    int     TotalOrdersAssigned              // Assigned basis: every order assigned that day (delivered or not); 0 on Delivered basis
);
