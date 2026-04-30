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
    bool   IsFragile,
    OrderStatus   Status,
    PaymentStatus ProductPaymentStatus,
    ServicePayer  WhoPaysForCompanyService,
    DateTime  CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo
);
