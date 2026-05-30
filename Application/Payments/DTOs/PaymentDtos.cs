namespace Application.Payments.DTOs;

// ── Shared ────────────────────────────────────────────────────────────────────

public sealed record PaymentOrderItem(
    string   OrderId,
    string   TrackingNumber,
    string   RecipientFirstName,
    string   RecipientCity,
    string   RecipientDistrict,
    decimal  CompanyServicePrice,
    decimal? AmountOfCashCollected,
    decimal? AmountToCollectForPackage,
    string   Status,
    string   CompanyServicePaymentStatus,
    bool     HasCompanyPaidTheSender,
    DateTime CreatedAt,
    DateTime? DeliveredAt
);

// ── Admin: Collect from Senders ───────────────────────────────────────────────

public sealed record AdminSenderPaymentRequestDto(
    Guid    PaymentRequestId,
    Guid    CustomerId,
    string  CustomerBusinessName,
    string  CustomerPhone,
    decimal TotalAmount,
    decimal AmountConfirmed,
    string  Status,
    string? Note,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    IReadOnlyList<PaymentOrderItem> Orders
);

public sealed record AdminCollectFromSendersDto(
    IReadOnlyList<AdminSenderPaymentRequestDto> PendingRequests,
    IReadOnlyList<AdminUnpaidSenderGroupDto> UnpaidGroups
);

public sealed record AdminUnpaidSenderGroupDto(
    Guid    CustomerId,
    string  CustomerBusinessName,
    string  CustomerPhone,
    decimal TotalUnpaid,
    int     OrderCount
);

// ── Admin: Pay Senders COD ────────────────────────────────────────────────────

public sealed record AdminCodOwedToSenderDto(
    Guid    CustomerId,
    string  CustomerBusinessName,
    string  CustomerPhone,
    decimal TotalCodOwed,
    decimal TotalServiceFeesOwed,
    decimal SuggestedNetTransfer,
    IReadOnlyList<PaymentOrderItem> CodOrders,
    IReadOnlyList<PaymentOrderItem> OffsetEligibleFeeOrders
);

// ── Admin: Courier Settlements ────────────────────────────────────────────────

public sealed record AdminCourierSettlementDto(
    Guid     SettlementId,
    Guid     CourierId,
    string   CourierFullName,
    string   CourierPhone,
    DateTime SettlementDate,
    int      TotalOrdersDelivered,
    int      TotalOrdersPickedUp,
    decimal? TotalAmountOfCashCollected,
    decimal  TotalCodOwedToSenders,
    decimal  TotalCompanyServiceRevenue,
    decimal  TotalServiceFeesOwedBySenders,
    decimal  TotalCourierSalary,
    decimal  TotalCourierTransferToCompany,
    decimal  CompanyNetCashAfterCod,
    decimal  TotalCompanyNetIncome,
    bool     IsTheDayClosed,
    bool     WasCourierPaid,
    DateTime? CourierPaidAt,
    bool     HasCourierHandedOverRevenue,
    DateTime? RevenueHandedOverAt
);

// ── Admin: full Payments page ─────────────────────────────────────────────────

public sealed record AdminPaymentsPageDto(
    AdminCollectFromSendersDto               CollectFromSenders,
    IReadOnlyList<AdminCodOwedToSenderDto>   PayToSenders,
    IReadOnlyList<AdminCourierSettlementDto> CourierSettlements
);

// ── Customer: service fee section ────────────────────────────────────────────

public sealed record CustomerServiceFeeOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientFirstName,
    string  RecipientCity,
    string  RecipientDistrict,
    decimal CompanyServicePrice,
    string  OrderStatus,
    string  CompanyServicePaymentStatus,
    Guid?   PaymentRequestId,
    DateTime CreatedAt,
    DateTime? DeliveredAt
);

public sealed record CustomerPaymentRequestSummaryDto(
    Guid     PaymentRequestId,
    decimal  TotalAmount,
    decimal  AmountConfirmed,
    string   Status,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    int      OrderCount
);

// ── Customer: COD income section ──────────────────────────────────────────────

public sealed record CustomerCodIncomeOrderDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientFirstName,
    string  RecipientCity,
    decimal AmountCollected,
    string  OrderStatus,
    bool    HasCompanyPaidTheSender,
    DateTime? DeliveredAt
);

/// <summary>
/// A single COD payout the company made to this sender.
/// Shown in the customer's COD Income tab so they can see exactly how much
/// they received and why it may be less than the gross COD amount.
///
/// Example: COD ₾305.50, service fee offset ₾28.00, net paid ₾277.50.
/// Note auto-generated: "COD ₾305.50 − service fees ₾28.00 = net ₾277.50"
/// </summary>
public sealed record CustomerCodPayoutDto(
    Guid     PaymentRequestId,
    DateTime PaidAt,
    /// <summary>Gross COD this payout covers (sum of AmountToCollectForPackage).</summary>
    decimal  GrossCod,
    /// <summary>Service fees the sender owed, deducted from the COD. Zero if no netting.</summary>
    decimal  ServiceFeeOffset,
    /// <summary>Actual amount transferred to sender: max(0, GrossCod − ServiceFeeOffset).</summary>
    decimal  NetAmountPaid,
    /// <summary>Auto-generated breakdown note, e.g. "COD ₾305.50 − service fees ₾28.00 = net ₾277.50"</summary>
    string?  Note,
    int      OrderCount
);

// ── Customer: full Payments page ──────────────────────────────────────────────

public sealed record CustomerPaymentsPageDto(
    IReadOnlyList<CustomerServiceFeeOrderDto>       ServiceFeeOrders,
    IReadOnlyList<CustomerPaymentRequestSummaryDto> PaymentRequests,
    IReadOnlyList<CustomerCodIncomeOrderDto>        CodIncomeOrders,
    /// <summary>History of all COD payouts from company to this sender, with netting breakdown.</summary>
    IReadOnlyList<CustomerCodPayoutDto>             CodPayouts,
    decimal TotalServiceFeeUnpaid,
    decimal TotalServiceFeePending,
    decimal TotalServiceFeePaid,
    decimal TotalCodPending,
    decimal TotalCodReceived
);
