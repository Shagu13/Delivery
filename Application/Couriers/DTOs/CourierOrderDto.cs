using Domain.Enums;

namespace Application.Couriers.DTOs;

/// <summary>Order as seen by the courier responsible for last-mile delivery.</summary>
public sealed record CourierOrderDto(
    Guid   Id,
    string TrackingNumber,
    string? SenderBusinessName,
    /// <summary>The sender's (shop's) phone — sourced the same way as <see cref="SenderBusinessName"/>.</summary>
    string? SenderPhone,
    string RecipientName,
    string RecipientPhone,
    string RecipientCity,
    string RecipientDistrict,
    string RecipientAddress,
    /// <summary>Exact coordinates of the delivery/pickup point, when the address was geocoded. Null otherwise.</summary>
    double? Latitude,
    double? Longitude,
    string? Description,
    bool   IsFragile,
    /// <summary>
    /// Whether this is a Send, Return, or Exchange order.
    /// For Return: courier must go to ReturnPickupAddress (not RecipientAddress) to collect the parcel.
    /// </summary>
    OrderType     OrderType,
    /// <summary>Address to collect from when OrderType == Return.</summary>
    string?       ReturnPickupAddress,
    string?       ReturnPickupCity,
    string?       ReturnPickupDistrict,
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
    /// <summary>When this courier was assigned this order (last-mile assignment, or the
    /// Return-pickup assignment) — lets the courier see which of their jobs is oldest.</summary>
    DateTime? AssignedToCourierAt,
    DateTime? PickedUpFromWarehouseAt,
    DateTime? DeliveredAt,
    DateTime? DeliveryDateFrom,
    DateTime? DeliveryDateTo,
    PostponeReason? PostponeReason,
    /// <summary>Free-text note captured when PostponeReason is "Other". Null otherwise.</summary>
    string?         PostponeComment,
    DateTime?       PostponedAt
);
