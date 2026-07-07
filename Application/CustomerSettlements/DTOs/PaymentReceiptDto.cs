namespace Application.CustomerSettlements.DTOs;

/// <summary>One admin pay/settle action — a COD payout or service-fee collection covering
/// one or more orders — for the payment-history views (admin + customer).</summary>
public sealed record PaymentReceiptDto(
    Guid    Id,
    bool    IsService,
    decimal TotalAmount,
    string  PaidAt,
    IReadOnlyList<PaymentReceiptOrderDto> Orders
);

public sealed record PaymentReceiptOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientName,
    decimal Amount
);
