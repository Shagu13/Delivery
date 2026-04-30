using Domain.Enums;

namespace Application.Orders.DTOs;

public sealed record TrackOrderDto(
    Guid   OrderId,
    string TrackingNumber,
    OrderStatus Status,

    // Recipient
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,

    // Package details
    bool IsFragile,

    // Assignment (null until set)
    string? CourierFullName,
    string? WarehouseName,

    // Timestamps
    DateTime  CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo,

    // Timeline
    IReadOnlyList<TrackingEventDto> TrackingEvents
);
