namespace Application.Orders.Queries.GetAllOrders;

public sealed record AdminOrderListDto(
    Guid     Id,
    string   TrackingNumber,
    // Sender info (from GroupOrder)
    string   SenderBusinessName,
    string   SenderFirstName,
    string   SenderLastName,
    string   SenderPhone,
    // Recipient
    string   RecipientFirstName,
    string   RecipientLastName,
    string   RecipientPhone,
    string   RecipientCity,
    string?  RecipientCityGeo,
    string   RecipientDistrict,
    string?  RecipientDistrictGeo,
    string   RecipientAddress,
    string?  Description,
    bool     IsFragile,
    // Status & payment
    string   Status,
    string   ProductPaymentStatus,
    string   WhoPaysForCompanyService,
    // COD — cash the courier must collect from the recipient for the product itself.
    // Only set when ProductPaymentStatus == NotPaid AND WhoPaysForCompanyService == Recipient.
    decimal? AmountToCollectForPackage,
    // Financials
    decimal  CompanyServicePrice,
    decimal? CourierSalary,
    decimal? CompanyRevenue,
    // Dates
    DateTime CreatedAt,
    DateTime? DeliveredAt
);
