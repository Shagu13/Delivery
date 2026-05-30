namespace Application.Payments.DTOs;

// ── Shared ────────────────────────────────────────────────────────────────────

public sealed record PaymentOrderItemDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientFirstName,
    string  RecipientCity,
    string  RecipientDistrict,
    decimal CompanyServicePrice,
    decimal? AmountOfCashCollected,
    decimal? AmountToCollectForPackage,
    string  Status,                     // OrderStatus string
    string  CompanyServicePaymentStatus,
    bool    HasCompanyPaidTheSender,
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
    string  Status,                     // PaymentRequestStatus string
    string? Note,
    DateTime CreatedAt,
    DateTime? ConfirmedAt,
    IReadOnlyList<PaymentOrderItemDto> Orders
);

public sealed record AdminCollectFromSendersDto(
    IReadOnlyList<AdminSenderPaymentRequestDto> PendingRequests,
    /// <summary>Orders with WhoPaysForCompanyService == Sender and CompanyServicePaymentStatus == Unpaid,
    /// grouped by customer — senders who haven't submitted a request yet.</summary>
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
    IReadOnlyList<PaymentOrderItemDto> Orders
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

    // ── Cash collected ────────────────────────────────────────────────────────
    /// <summary>Total cash physically collected by the courier (COD + bundled service fees).</summary>
    decimal? TotalAmountOfCashCollected,

    // ── COD ───────────────────────────────────────────────────────────────────
    /// <summary>Product money the company must forward back to senders.</summary>
    decimal  TotalCodOwedToSenders,

    // ── Service revenue ───────────────────────────────────────────────────────
    decimal  TotalCompanyServiceRevenue,

    /// <summary>Service fees not yet collected from Sender-payer customers.</summary>
    decimal  TotalServiceFeesOwedBySenders,

    // ── Salary & transfer ─────────────────────────────────────────────────────
    decimal  TotalCourierSalary,

    /// <summary>Cash the courier hands over: TotalAmountOfCashCollected − TotalCourierSalary.</summary>
    decimal  TotalCourierTransferToCompany,

    // ── Company position ──────────────────────────────────────────────────────
    /// <summary>
    /// Company cash after receiving handover and paying COD to senders.
    /// = TotalCourierTransferToCompany − TotalCodOwedToSenders.
    /// Can be negative; add TotalServiceFeesOwedBySenders to get TotalCompanyNetIncome.
    /// </summary>
    decimal  CompanyNetCashAfterCod,

    decimal  TotalCompanyNetIncome,

    // ── Status flags ──────────────────────────────────────────────────────────
    bool     IsTheDayClosed,
    bool     WasCourierPaid,
    DateTime? CourierPaidAt,
    bool     HasCourierHandedOverRevenue,
    DateTime? RevenueHandedOverAt
);

// ── Admin: full Payments page ─────────────────────────────────────────────────

public sealed record AdminPaymentsPageDto(
    AdminCollectFromSendersDto                CollectFromSenders,
    IReadOnlyList<AdminCodOwedToSenderDto>    PayToSenders,
    IReadOnlyList<AdminCourierSettlementDto>  CourierSettlements
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
    /// <summary>All orders for the selected month (filtered client-side further).</summary>
    IReadOnlyList<CustomerServiceFeeOrderDto>       ServiceFeeOrders,
    IReadOnlyList<CustomerPaymentRequestSummaryDto> PaymentRequests,
    IReadOnlyList<CustomerCodIncomeOrderDto>        CodIncomeOrders,
    /// <summary>Summary totals for the selected month.</summary>
    decimal TotalServiceFeeUnpaid,
    decimal TotalServiceFeePending,
    decimal TotalServiceFeePaid,
    decimal TotalCodPending,
    decimal TotalCodReceived
);
