namespace Application.CustomerSettlements.DTOs;

/// <summary>
/// A stored monthly customer settlement row. Used by the admin Finance page and
/// the customer's read-only Statistics page. Outstanding balances are derived.
/// </summary>
public sealed record CustomerSettlementDto(
    Guid    Id,
    Guid    CustomerId,
    string  CustomerBusinessName,
    int     Year,
    int     Month,

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

    string  CreatedAt,
    string? UpdatedAt
);
