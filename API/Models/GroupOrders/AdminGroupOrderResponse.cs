namespace API.Models.GroupOrders;

/// <summary>HTTP response for GET /api/grouporders — admin list view.</summary>
public sealed record AdminGroupOrderResponse(
    Guid    Id,
    DateTime CreatedAt,
    string  Status,
    // Sender
    string  SenderFirstName,
    string  SenderLastName,
    string? SenderIdNumber,
    string  SenderBusinessName,
    string  SenderPhone,
    string? AlternativeSenderPhone,
    // Pickup
    string    PickUpCity,
    string?   PickUpCityGeo,
    string    PickUpDistrict,
    string?   PickUpDistrictGeo,
    string    PickUpAddress,
    string?   Note,
    int       NumberOfPackages,
    DateTime? WhenPackagePickedUpDate,
    // Pickup courier (null until assigned by admin)
    Guid?   CourierId,
    string? CourierFullName,
    IReadOnlyList<AdminOrderResponse> Orders
);

/// <summary>One package row inside an AdminGroupOrderResponse.</summary>
public sealed record AdminOrderResponse(
    Guid    Id,
    string  TrackingNumber,
    string  RecipientFirstName,
    string  RecipientLastName,
    string  RecipientPhone,
    string  RecipientCity,
    string? RecipientCityGeo,
    string  RecipientDistrict,
    string? RecipientDistrictGeo,
    string  RecipientAddress,
    string? Description,
    bool    IsFragile,
    /// <summary>"Send" | "Return" | "Exchange"</summary>
    string  OrderType,
    /// <summary>Return pickup address — null for Send/Exchange orders.</summary>
    string? ReturnPickupAddress,
    string? ReturnPickupCity,
    string? ReturnPickupDistrict,
    string  Status,
    string  ProductPaymentStatus,
    string  WhoPaysForCompanyService,
    /// <summary>COD — cash to collect from the recipient for the product.</summary>
    decimal? AmountToCollectForPackage,
    /// <summary>Cash the courier actually collected (set during settlement).</summary>
    decimal? AmountOfCashCollected,
    decimal? CourierSalary,
    /// <summary>Company service fee for this package — shown to the sender on their dashboard.</summary>
    decimal  CompanyServicePrice,
    /// <summary>Company revenue (margin) — admin only; null on customer responses.</summary>
    decimal? CompanyRevenue,
    // Last-mile delivery courier (null until assigned)
    Guid?    CourierId,
    DateTime CreatedAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo,
    DateTime? DeliveredAt
);
