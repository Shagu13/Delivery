namespace Application.CustomerSettlements.DTOs;

/// <summary>
/// A single-order finance row for the reworked finance pages. One row per active
/// order. Customers list these by placement date (CreatedAt); admins and couriers
/// list them by delivery date (DeliveredAt ?? DeliveredToWarehouseAt). Payment state
/// for both money flows lives on the order itself.
/// </summary>
public sealed record OrderFinanceLineDto(
    Guid    OrderId,
    string  TrackingNumber,
    string  RecipientName,
    string  RecipientCity,
    string  RecipientDistrict,
    string  RecipientAddress,
    string  OrderType,
    string  Status,
    string  ProductPaymentStatus,
    bool    IsReturn,

    Guid    CustomerId,
    string  CustomerBusinessName,

    /// <summary>Placement date (ISO-8601).</summary>
    string  CreatedAt,
    /// <summary>Delivery date (DeliveredAt ?? DeliveredToWarehouseAt), ISO-8601 or null.</summary>
    string? DeliveredAt,

    // ── COD payout: company → customer ────────────────────────────────────────
    decimal? CodAmount,
    bool     IsCollectedCodPaidToCustomer,
    decimal? CodPaidToCustomerAmount,
    string?  CodPaidToCustomerAt,

    // ── Service fee: customer → company (sender-pays only) ────────────────────
    decimal CompanyServicePrice,
    string  WhoPaysForCompanyService,
    string  CompanyServicePaymentStatus,
    decimal? ServicePaidByCustomerAmount,
    string?  ServicePaidByCustomerAt,

    // ── Courier-facing figures ────────────────────────────────────────────────
    decimal? CourierSalary,
    decimal? AmountOfCashCollected,

    // ── Courier settlement (per-order; admin-recorded) ────────────────────────
    decimal? CourierSalaryPaidAmount,
    string?  CourierSalaryPaidAt,
    bool     IsCourierSalaryPaid,
    decimal? CodTransferedToCompanyByCourier,
    string?  CodTransferedToCompanyByCourierAt,
    bool     HasCourierTransferedAmount,

    // ── Derived company figures (live; never stored) ──────────────────────────
    decimal  CompanyRevenue,
    decimal  CompanyNetCash,
    bool     IsCompanyServicePaid,

    /// <summary>
    /// True when the customer (sender) owes the company the service fee for this order —
    /// for sender-pays orders and for billable failed deliveries (the recipient declined, so
    /// the fee shifts to the sender even if it was originally recipient-pays). Clients should
    /// use this, not <see cref="WhoPaysForCompanyService"/>, to decide whether the fee is owed.
    /// </summary>
    bool     SenderOwesService,

    /// <summary>
    /// True when this is a billable failed delivery (courier declined / admin cancelled after
    /// assignment / Send returned-to-sender). No COD was collected, so none is owed back to the
    /// customer, but the sender still owes the service fee.
    /// </summary>
    bool     IsBillableFailedDelivery,

    /// <summary>Cancellation reason (enum name) when set, so the UI can show why a billable
    /// failed delivery is charged. Null for normal orders.</summary>
    string?  CancellationReason,
    /// <summary>Free-text comment for the "Other" cancellation reason, if any.</summary>
    string?  CancellationComment,
    /// <summary>Free-text comment left when a delivery was postponed with the "Other" reason, if any.</summary>
    string?  PostponeComment,
    /// <summary>The note the customer typed when placing the batch (GroupOrder.Note), if any.
    /// Null for standalone Return orders (no parent GroupOrder).</summary>
    string?  OrderNote,
    /// <summary>The package description entered for this order, if any.</summary>
    string?  Description
);
