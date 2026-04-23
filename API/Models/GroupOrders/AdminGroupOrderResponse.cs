namespace API.Models.GroupOrders;

/// <summary>
/// HTTP response for GET /api/grouporders (admin list view).
/// One entry per group order, each with its full list of child orders.
/// </summary>
public sealed record AdminGroupOrderResponse(
    Guid Id,
    DateTime CreatedAt,
    string Status,
    // Sender
    string SenderFirstName,
    string SenderLastName,
    string? SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    // Pickup
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    int NumberOfPackages,
    IReadOnlyList<AdminOrderResponse> Orders
);

/// <summary>One package row inside an AdminGroupOrderResponse.</summary>
public sealed record AdminOrderResponse(
    Guid Id,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description,
    string Status,
    bool IsPaid,
    DateTime CreatedAt
);
