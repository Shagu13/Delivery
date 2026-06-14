using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>
/// Output DTO for a single Order as seen inside a GroupOrderResponseDto.
/// </summary>
public sealed record OrderResponseDto(
    Guid   Id,
    string TrackingNumber,
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    string? Description,
    bool   IsFragile,
    OrderStatus   Status,
    PaymentStatus ProductPaymentStatus,
    ServicePayer  WhoPaysForCompanyService,
    decimal?      CourierSalary,

    // Courier assigned for last-mile delivery — null until admin assigns
    Guid?   CourierId,
    string? CourierFullName,

    // Warehouse — null until GroupOrder is DeliveredToWarehouse
    Guid?   WarehouseId,
    string? WarehouseName,

    DateTime  CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo
);
