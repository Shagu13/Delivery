using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>Full group order representation for the admin dashboard.</summary>
public sealed record AdminGroupOrderDto(
    Guid   Id,
    DateTime CreatedAt,
    OrderStatus Status,
    // Sender
    string  SenderFirstName,
    string  SenderLastName,
    string? SenderIdNumber,
    string  SenderBusinessName,
    string  SenderPhone,
    // Pickup
    string  PickUpCity,
    string? PickUpCityGeo,
    string  PickUpDistrict,
    string? PickUpDistrictGeo,
    string  PickUpAddress,
    string? Note,
    int     NumberOfPackages,
    DateTime? WhenPackagePickedUpDate,
    // Assigned pickup courier (null until assigned)
    Guid?   CourierId,
    string? CourierFullName,
    // Child orders
    IReadOnlyList<AdminOrderDto> Orders
);

/// <summary>Single package within a group order — admin view.</summary>
public sealed record AdminOrderDto(
    Guid   Id,
    string TrackingNumber,
    string RecipientFirstName,
    string RecipientLastName,
    string RecipientPhone,
    string RecipientCity,
    string? RecipientCityGeo,
    string RecipientDistrict,
    string? RecipientDistrictGeo,
    string RecipientAddress,
    string? Description,
    bool   IsFragile,
    OrderStatus   Status,
    PaymentStatus ProductPaymentStatus,
    ServicePayer  WhoPaysForCompanyService,
    decimal?      CourierSalary,
    decimal       CompanyServicePrice,
    decimal?      CompanyRevenue,
    // Last-mile courier (null until admin assigns for delivery)
    Guid?    CourierId,
    DateTime CreatedAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo
);
