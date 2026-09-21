using Domain.Enums;

namespace Application.Orders.DTOs;

/// <summary>
/// Slim order view shown in the courier's history — private recipient fields
/// (phone, tracking number) are intentionally excluded. <see cref="ShopName"/> and
/// <see cref="ShopPhone"/> are the sender's, not the recipient's — sourced from
/// <c>GroupOrder</c> for Send/Exchange or <c>Customer</c> for a standalone Return.
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
    DateTime?   CancelledAt = null,
    string?     ShopName = null,
    string?     ShopPhone = null
);
