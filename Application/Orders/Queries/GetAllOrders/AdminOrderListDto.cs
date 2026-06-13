namespace Application.Orders.Queries.GetAllOrders;

public sealed record AdminOrderListDto(
    Guid     Id,
    string   TrackingNumber,
    // Sender info (from GroupOrder)
    string   SenderBusinessName,
    string   SenderFirstName,
    string   SenderLastName,
    string   SenderPhone,
    string?  AlternativeSenderPhone,
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
    /// <summary>True when the package price was entered all-in (product + service fee bundled).</summary>
    bool     IsCompanyServicePriceIncluded,
    decimal? CourierSalary,
    decimal? CompanyRevenue,
    // Courier assignment
    Guid?    CourierId,
    string?  CourierFullName,   // assigned courier's first + last name, null when unassigned
    // Dates
    DateTime CreatedAt,
    DateTime? DeliveredAt
);
