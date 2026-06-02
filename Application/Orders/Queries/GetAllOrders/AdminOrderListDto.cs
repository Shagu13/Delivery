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
    // Order type & status
    string   OrderType,             // "Send" | "Return" | "Exchange"
    string   Status,
    string   ProductPaymentStatus,
    string   WhoPaysForCompanyService,
    // Return pickup address (only populated when OrderType == "Return")
    string?  ReturnPickupAddress,
    string?  ReturnPickupCity,
    string?  ReturnPickupDistrict,
    // COD
    decimal? AmountToCollectForPackage,
    // Financials
    decimal  CompanyServicePrice,
    decimal? CourierSalary,
    decimal? CompanyRevenue,
    // Courier assignment
    Guid?    CourierId,
    // Dates
    DateTime CreatedAt,
    DateTime? DeliveredAt
);
