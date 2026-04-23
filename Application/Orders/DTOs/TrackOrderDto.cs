using Domain.Enums;

namespace Application.Orders.DTOs;

public sealed record TrackOrderDto(
    Guid OrderId,
    string TrackingNumber,
    OrderStatus Status,

    // Recipient
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,

    // Assignment (null until set)
    string? CourierFullName,
    string? WarehouseName,

    // Timestamps
    DateTime CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,

    // Timeline
    IReadOnlyList<TrackingEventDto> TrackingEvents
);
