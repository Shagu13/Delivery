namespace Application.TenantSettlements.DTOs;

/// <summary>
/// The monthly tenant ↔ company (dilo) settlement, with derived outstanding balances.
///   • COD dilo collected for the tenant → dilo owes the tenant (OutstandingCodOwedToTenant).
///   • Sender-paid service fees for the tenant's deliveries → tenant owes dilo (OutstandingServiceOwedByTenant).
/// </summary>
public sealed record TenantSettlementDto(
    Guid     Id,
    Guid     TenantId,
    string   TenantDisplayName,
    int      Year,
    int      Month,
    int      TotalNumberOfOrdersPlaced,
    int      TotalNumberOfOrderDelivered,
    // dilo owes tenant (COD)
    decimal  TotalCODCompanyCollectedForTenant,
    decimal  TotalAmountOfCollectedCodPaidToTenant,
    decimal  AmountOfCollectedCodPaidToTenant,
    decimal  OutstandingCodOwedToTenant,
    // tenant owes dilo (service)
    decimal  TotalCompanyServicePriceOwedByTenant,
    decimal  TotalAmountPaidToCompanyForCompanyService,
    decimal  AmountPaidToCompanyForCompanyService,
    decimal  OutstandingServiceOwedByTenant,
    string?  UpdatedAt
);
