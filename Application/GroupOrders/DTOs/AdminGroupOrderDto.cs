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
    string? AlternativeSenderPhone,
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
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string? RecipientCityGeo,
    string RecipientDistrict,
    string? RecipientDistrictGeo,
    string RecipientAddress,
    string? Description,
    bool   IsFragile,
    // Order type
    OrderType     OrderType,
    // Return pickup address (null for Send/Exchange)
    string?       ReturnPickupAddress,
    string?       ReturnPickupCity,
    string?       ReturnPickupDistrict,
    // Status & payment
    OrderStatus   Status,
    PaymentStatus ProductPaymentStatus,
    ServicePayer  WhoPaysForCompanyService,
    /// <summary>COD: cash the courier must collect from the recipient for the product.</summary>
    decimal?      AmountToCollectForPackage,
    /// <summary>Cash the courier actually collected (set during settlement).</summary>
    decimal?      AmountOfCashCollected,
    decimal?      CourierSalary,
    decimal       CompanyServicePrice,
    /// <summary>True when the package price was entered all-in (product + service fee bundled).</summary>
    bool          IsCompanyServicePriceIncluded,
    decimal?      CompanyRevenue,
    // Last-mile courier (null until admin assigns for delivery)
    Guid?    CourierId,
    DateTime CreatedAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo,
    DateTime? DeliveredAt
);
