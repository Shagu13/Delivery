using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Slim group-order view for the courier's pickup history.
/// Sender ID number is intentionally excluded.
/// </summary>
public sealed record CourierPickupHistoryDto(
    Guid        Id,
    string      SenderFirstName,
    string      SenderLastName,
    string      SenderBusinessName,
    string      SenderPhone,
    string      PickUpCity,
    string      PickUpDistrict,
    string      PickUpAddress,
    string?     Note,
    int         NumberOfPackages,
    OrderStatus Status,
    DateTime    CreatedAt,
    DateTime?   PickedUpAt,
    DateTime?   DeliveredToWarehouseAt
);
