using Domain.Enums;

namespace Application.GroupOrders.DTOs;

/// <summary>Full group order representation for the admin dashboard.</summary>
public sealed record AdminGroupOrderDto(
    Guid   Id,
    DateTime CreatedAt,
    OrderStatus Status,
    // Customer link (null for legacy/guest batches) — used by the admin Pick-ups
    // view to unite all of one customer's same-day batches under a single card.
    Guid?  CustomerId,
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
    // Actual pickup / warehouse-drop timestamps (null until they happen).
    DateTime? PickedUpAt,
    DateTime? DeliveredToWarehouseAt,
    // Assigned pickup courier (null until assigned)
    Guid?   CourierId,
    string? CourierFullName,
    // Customer-specific service pricing (null when the batch has no linked customer
    // or that tier isn't configured). Used by the admin edit modal to auto-fill the
    // company service price by the recipient district's territory.
    decimal? CompanyServiceCapitalPrice,
    decimal? CompanyServiceCityPrice,
    decimal? CompanyServiceDistrictPrice,
    // Child orders
    IReadOnlyList<AdminOrderDto> Orders,
    // True for a synthetic "batch" wrapping a single standalone order (GroupOrderId
    // == null). The Pick-Up page shows it like a batch but offers a Group action
    // instead of batch lifecycle actions; the Id is the order's own id.
    bool IsStandalone = false
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
    DateTime? DeliveredAt,
    // Why a courier cancelled the delivery (null unless cancelled by courier).
    CancellationReason? CancellationReason = null,
    string?             CancellationComment = null,
    /// <summary>When an admin marked this cancelled order as physically returned to the sender. Null otherwise.</summary>
    DateTime?           CancelledReturnedToSenderAt = null
);
