namespace Application.CustomerSettlements.DTOs;

/// <summary>
/// A per-batch customer invoice row (one GroupOrder batch or one standalone Return).
/// Used by the admin Finance page and the customer's read-only Finance page.
/// Outstanding balances are derived (owed − paid).
/// </summary>
public sealed record CustomerSettlementDto(
    Guid    Id,
    Guid    CustomerId,
    string  CustomerBusinessName,

    // ── Batch link — exactly one is set ──────────────────────────────────────
    Guid?   GroupOrderId,
    Guid?   OrderId,
    bool    IsReturn,
    int     NumberOfPackages,
    string  Status,

    int     TotalNumberOfOrdersPlaced,
    int     TotalNumberOfOrderDelivered,

    // COD the company collected for the customer's packages (company owes customer)
    decimal TotalCODCompanyCollectedForPackages,
    decimal TotalAmountOfCollectedCodPaidByCompany,
    decimal AmountOfCollectedCodPaidByCompany,
    /// <summary>COD still owed to the customer: collected − paid.</summary>
    decimal OutstandingCodOwedToCustomer,

    // Service fees the customer owes the company (customer owes company)
    decimal TotalCompanyServicePriceOwedToCompany,
    decimal TotalAmountPaidToCompanyForCompanyService,
    decimal AmountPaidToCompanyForCompanyService,
    /// <summary>Service fees still owed by the customer: owed − paid.</summary>
    decimal OutstandingServiceOwedToCompany,

    /// <summary>Batch placement date (ISO-8601).</summary>
    string  CreatedAt,
    string? UpdatedAt
);
