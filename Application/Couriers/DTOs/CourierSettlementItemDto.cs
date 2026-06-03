namespace Application.Settlements.DTOs;

/// <summary>
/// A single daily settlement record as seen by the courier who owns it.
/// Financial fields are read-only — the courier cannot modify them.
/// </summary>
public sealed record CourierSettlementItemDto(
    Guid    Id,
    string  Date,                            // "YYYY-MM-DD" derived from CreatedAt
    int     TotalOrdersPickedUp,
    int     TotalOrdersDelivered,
    int     NumberOfOrdersCancelled,         // orders cancelled on this day
    int     NumberOfOrderPostponed,          // orders postponed on this day
    decimal TotalAmountOfCashCollected,      // cash received from recipients
    decimal TotalCompanyServiceRevenue,      // sum of all delivery fees for the day
    decimal TotalCourierSalary,              // what the courier earns
    decimal AmountCourierWasPaid,            // what the courier was actually paid
    decimal TotalCourierTransferToCompany,   // cash − salary = hand-over amount
    bool    IsTheDayClosed
);
