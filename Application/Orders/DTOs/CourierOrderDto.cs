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
    /// <summary>
    /// Cash amount the courier must collect from the recipient for the product (COD).
    /// Only set when ProductPaymentStatus == NotPaid AND WhoPaysForCompanyService == Recipient.
    /// </summary>
    decimal? AmountToCollectForPackage,
    /// <summary>
    /// The company's courier service fee for this order.
    /// Needed so the courier knows how much to collect when WhoPaysForCompanyService == Recipient.
    /// </summary>
    decimal CompanyServicePrice,
    DateTime  CreatedAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo,
    PostponeReason? PostponeReason,
    DateTime?       PostponedAt
);
