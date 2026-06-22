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
    decimal? AmountOfCashCollected
);
