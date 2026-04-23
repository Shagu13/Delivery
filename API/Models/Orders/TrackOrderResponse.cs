namespace API.Models.Orders;

public sealed record TrackingEventResponse(
    string Status,
    string Description,
    DateTime CreatedAt
);

public sealed record TrackOrderResponse(
    Guid OrderId,
    string TrackingNumber,
    string Status,

    string RecipientFirstName,
    string RecipientLastName,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,

    string? CourierFullName,
    string? WarehouseName,

    DateTime CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,

    IReadOnlyList<TrackingEventResponse> TrackingEvents
);
