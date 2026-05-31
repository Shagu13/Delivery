namespace Application.Settlements.Queries;

public sealed record SettlementPreviewDto(
    Guid     CourierId,
    string   CourierFullName,
    DateOnly Date,

    /// <summary>
    /// If a settlement already exists for this courier+date, contains its ID.
    /// Null if no settlement exists yet. Used by the frontend to show
    /// "Update Settlement" instead of "Save Settlement".
    /// </summary>
    Guid?    ExistingSettlementId,

    int      TotalOrdersPickedUp,
    int      TotalOrdersDelivered,

    /// <summary>Sum of AmountOfCashCollected — COD product payments collected from recipients.</summary>
    decimal  TotalAmountOfCashCollected,

    /// <summary>Sum of ALL CompanyServicePrice values (regardless of who pays).</summary>
    decimal  TotalCompanyServiceRevenue,

    /// <summary>
    /// Sum of CompanyServicePrice for orders where WhoPaysForCompanyService == Recipient.
    /// This is the service fee cash the courier collected directly from recipients.
    /// </summary>
    decimal  TotalServiceFeesCollectedFromRecipients,

    /// <summary>
    /// Total cash the courier physically holds:
    /// TotalAmountOfCashCollected (COD) + TotalServiceFeesCollectedFromRecipients.
    /// This is what the courier must account for at settlement.
    /// </summary>
    decimal  TotalCashCourierHolds,

    decimal  TotalCourierSalary,
    decimal  TotalCompanyNetIncome,

    /// <summary>
    /// How much cash the courier must transfer to the company at end of day.
    /// TotalCashCourierHolds - TotalCourierSalary.
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
    /// <summary>"Sender" or "Recipient" — indicates who paid the service fee.</summary>
    string    WhoPaysForCompanyService,
    decimal?  CourierSalary,
    decimal?  CompanyRevenue,
    decimal?  AmountOfCashCollected,
    DateTime? DeliveredAt
);
