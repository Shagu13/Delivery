namespace Application.Settlements.Queries;

public sealed record SettlementPreviewDto(
    Guid     CourierId,
    string   CourierFullName,
    DateOnly Date,

    int      TotalOrdersPickedUp,
    int      TotalOrdersDelivered,

    decimal  TotalAmountOfCashCollected,
    decimal  TotalCompanyServiceRevenue,
    decimal  TotalCourierSalary,
    decimal  TotalCompanyNetIncome,

    /// <summary>
    /// How much cash the courier must transfer to the company at end of day.
    /// TotalAmountOfCashCollected - TotalCourierSalary.
    /// </summary>
    decimal  TotalCourierTransferToCompany,

    IReadOnlyList<SettlementOrderLineDto> Orders,

    /// <summary>Tracking numbers of delivered orders that still have missing/zero financial data.</summary>
    IReadOnlyList<string> IncompleteOrderTrackingNumbers
);

public sealed record SettlementOrderLineDto(
    Guid      Id,
    string    TrackingNumber,
    string    RecipientName,
    string    RecipientCity,
    string    RecipientDistrict,
    decimal   CompanyServicePrice,
    decimal?  CourierSalary,
    decimal?  CompanyRevenue,
    decimal?  AmountOfCashCollected,
    DateTime? DeliveredAt
);
