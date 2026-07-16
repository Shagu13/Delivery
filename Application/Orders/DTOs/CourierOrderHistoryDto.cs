using Domain.Enums;

namespace Application.Orders.DTOs;

/// <summary>
/// Slim order view shown in the courier's history — private recipient fields
/// (phone, tracking number) are intentionally excluded.
/// </summary>
public sealed record CourierOrderHistoryDto(
    Guid        Id,
    string      RecipientName,
    string      RecipientCity,
    string      RecipientDistrict,
    string      RecipientAddress,
    string?     Description,
    bool        IsFragile,
    OrderStatus Status,
    DateTime    CreatedAt,
    DateTime?   DeliveredAt,
    DateTime?   CancelledAt = null
);
