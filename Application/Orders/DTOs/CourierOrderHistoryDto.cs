using Domain.Enums;

namespace Application.Orders.DTOs;

/// <summary>
/// Slim order view shown in the courier's history — private recipient fields
/// (phone, tracking number) are intentionally excluded. <see cref="ShopName"/> and
/// <see cref="ShopPhone"/> are the sender's, not the recipient's — sourced from
/// <c>GroupOrder</c> for Send/Exchange or <c>Customer</c> for a standalone Return.
/// <see cref="CollectedAmount"/> is the cash (package COD + the service fee when the recipient
/// pays it) the courier actually collected at the door — zero for anything but a
/// <c>DeliveredToRecipient</c> order. Sourced from <c>OrderFinance.ExpectedCourierCash</c>.
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
    string?     ShopPhone = null,
    decimal     CollectedAmount = 0m
);
