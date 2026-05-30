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

// ── Customer: full Payments page ──────────────────────────────────────────────

public sealed record CustomerPaymentsPageDto(
    IReadOnlyList<CustomerServiceFeeOrderDto>       ServiceFeeOrders,
    IReadOnlyList<CustomerPaymentRequestSummaryDto> PaymentRequests,
    IReadOnlyList<CustomerCodIncomeOrderDto>        CodIncomeOrders,
    decimal TotalServiceFeeUnpaid,
    decimal TotalServiceFeePending,
    decimal TotalServiceFeePaid,
    decimal TotalCodPending,
    decimal TotalCodReceived
);
