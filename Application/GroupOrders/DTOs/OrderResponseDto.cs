using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Output DTO for a single Order as seen inside a GroupOrderResponseDto.
/// Shows recipient info, current status, and tracking number.
/// </summary>
public sealed record OrderResponseDto(
    Guid Id,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description,
    OrderStatus Status,

    // Courier assigned for last-mile delivery — null until admin assigns
    Guid? CourierId,
    string? CourierFullName,

    // Warehouse — null until GroupOrder is DeliveredToWarehouse
    Guid? WarehouseId,
    string? WarehouseName,

    DateTime CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt
);
