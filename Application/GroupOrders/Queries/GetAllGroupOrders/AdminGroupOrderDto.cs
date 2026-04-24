using Domain.Enums;

namespace Application.GroupOrders.Queries.GetAllGroupOrders;

/// <summary>Full group order representation for the admin dashboard.</summary>
public sealed record AdminGroupOrderDto(
    Guid Id,
    DateTime CreatedAt,
    OrderStatus Status,   // ← unified enum (was GroupOrderStatus)
    // Sender
    string SenderFirstName,
    string SenderLastName,
    string? SenderIdNumber,
    string SenderBusinessName,
    string SenderPhone,
    // Pickup
    string PickUpCity,
    string PickUpDistrict,
    string PickUpAddress,
    string? Note,
    int NumberOfPackages,
    // Assigned pickup courier (null until assigned)
    Guid?   CourierId,
    string? CourierFullName,
    // Child orders
    IReadOnlyList<AdminOrderDto> Orders
);

/// <summary>Single package within a group order.</summary>
public sealed record AdminOrderDto(
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
    bool IsPaid,
    // Last-mile courier (null until admin assigns for delivery)
    Guid? CourierId,
    DateTime CreatedAt
);
