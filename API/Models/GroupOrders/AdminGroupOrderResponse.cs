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
    string  Status,
    string  ProductPaymentStatus,
    string  WhoPaysForCompanyService,
    decimal? CourierSalary,
    // Last-mile delivery courier (null until assigned)
    Guid?    CourierId,
    DateTime CreatedAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo
);
