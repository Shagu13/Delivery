using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Output DTO returned when reading a GroupOrder.
/// Used by GetGroupOrderByIdQuery, GetGroupOrdersQuery, GetCourierGroupOrdersQuery, etc.
/// </summary>
public sealed record GroupOrderResponseDto(
    Guid   Id,
    string SenderFirstName,
    string SenderLastName,
    string SenderIdNumber,
    string SenderPhone,
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    int     NumberOfPackages,
    OrderStatus Status,
    DateTime? WhenPackagePickedUpDate,

    // Courier info — null until a courier accepts or is assigned
    Guid?   CourierId,
    string? CourierFullName,
    string? CourierPhone,

    // Warehouse info — null until DeliveredToWarehouse
    Guid?   WarehouseId,
    string? WarehouseName,

    // Timestamps — each populated as status advances
    DateTime  CreatedAt,
    DateTime? AcceptedAt,
    DateTime? PickedUpAt,
    DateTime? DeliveredToWarehouseAt,

    // All packages in this group
    IReadOnlyList<OrderResponseDto> Orders
);
