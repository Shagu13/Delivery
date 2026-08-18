namespace Application.Orders.Queries.GetAllOrders;

public sealed record AdminOrderListDto(
    Guid     Id,
    string   TrackingNumber,
    // Sender info (from GroupOrder, or Customer for standalone orders)
    string   SenderBusinessName,
    string   SenderFirstName,
    string   SenderLastName,
    string   SenderPhone,
    string?  AlternativeSenderPhone,
    // Batch this order belongs to (null for standalone Return/Customer-direct orders) and
    // the sender's pickup location — used to group results by sender on the Packages page.
    Guid?    GroupOrderId,
    string   PickUpCity,
    string   PickUpDistrict,
    string   PickUpAddress,
    // Recipient
    string   RecipientName,
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
    DateTime? DeliveredAt,
    // Reason a delivery attempt failed (only set when Status == DeliveryPostponed)
    string?  PostponeReason,
    /// <summary>Free-text note captured when PostponeReason is "Other". Null otherwise.</summary>
    string?  PostponeComment,
    /// <summary>
    /// Total cash the courier is expected to collect from the recipient — product COD plus,
    /// when the recipient pays the company service fee, that fee too. See
    /// <see cref="Application.Finance.OrderFinance.ExpectedCourierCash"/>. Used by the admin
    /// Excel export's COD column.
    /// </summary>
    decimal  ExpectedCourierCash = 0m
);
