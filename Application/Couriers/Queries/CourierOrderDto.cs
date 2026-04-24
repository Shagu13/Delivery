using Domain.Enums;

namespace Application.Orders.DTOs;

/// <summary>Order as seen by the courier responsible for last-mile delivery.</summary>
public sealed record CourierOrderDto(
    Guid   Id,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description,
    OrderStatus Status,
    bool   IsPaid,
    DateTime CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt
);
