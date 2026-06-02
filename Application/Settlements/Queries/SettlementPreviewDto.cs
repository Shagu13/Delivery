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

    /// <summary>
    /// Sum of AmountOfCashCollected — the total cash physically collected by the courier
    /// (package COD + service fee bundled for Recipient-payer orders; package COD only for Sender-payer).
    /// </summary>
    decimal  TotalAmountOfCashCollected,

    /// <summary>
    /// Sum of AmountToCollectForPackage — the pure product/parcel money only (no service fees).
    /// Used for the "COD — Cash collected for parcels" display row so it does not include service fees.
    /// </summary>
    decimal  TotalCodOnlyAmount,

    /// <summary>Sum of ALL CompanyServicePrice values (regardless of who pays).</summary>
    decimal  TotalCompanyServiceRevenue,

    /// <summary>
    /// Sum of CompanyServicePrice for orders where WhoPaysForCompanyService == Recipient.
    /// This is the service fee cash the courier collected directly from recipients.
    /// </summary>
    decimal  TotalServiceFeesCollectedFromRecipients,

    /// <summary>
    /// Total cash the courier physically holds = TotalAmountOfCashCollected.
    /// (For Recipient-payer orders this already bundles package COD + service fee together.)
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
    IReadOnlyList<string> IncompleteOrderTrackingNumbers,

    // ── Payment status — only meaningful when ExistingSettlementId is not null ──
    bool      WasCourierPaid,
    DateTime? CourierPaidAt,
    bool      HasCourierHandedOverRevenue,
    DateTime? RevenueHandedOverAt
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
