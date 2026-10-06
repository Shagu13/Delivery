using Domain.Enums;

namespace Application.CustomerSettlements.DTOs;

/// <summary>One admin pay/settle action — a COD payout, service-fee collection, courier salary
/// payment or courier COD hand-over covering one or more orders — for the payment-history
/// views (admin, customer, courier). CourierId/CourierName are set for courier receipts only.</summary>
public sealed record PaymentReceiptDto(
    Guid    Id,
    bool    IsService,
    decimal TotalAmount,
    string  PaidAt,
    IReadOnlyList<PaymentReceiptOrderDto> Orders,
    PaymentReceiptFlow Flow = PaymentReceiptFlow.CodPayout,
    Guid?   CourierId   = null,
    string? CourierName = null
);

public sealed record PaymentReceiptOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientName,
    string  RecipientAddress,
    string? DeliveredAt,
    string? CourierName,
    decimal Amount
);
