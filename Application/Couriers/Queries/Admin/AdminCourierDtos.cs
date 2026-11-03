namespace Application.Couriers.Queries.Admin;

// Admin Couriers-page read models. Property names and order mirror the anonymous objects the
// controller used to return, so the camelCased JSON is unchanged. Enum-backed fields stay
// `string` (the controller projected `.ToString()`), not the enum.

/// <summary>One row of <c>GET /api/couriers</c> — the courier roster.</summary>
public sealed record CourierRosterDto(
    Guid      CourierId,
    string    FirstName,
    string    LastName,
    string    FullName,
    string?   Username,
    string    AssignedCity,
    string    AssignedDistrict,
    string    PhoneNumber,
    string    IdNumber,
    bool      IsDeleted,
    DateTime? DateDeleted,
    decimal?  DefaultSalary,
    string    DefaultDateBasis);

/// <summary>One row of <c>GET /api/couriers/{id}/orders</c> — every order ever assigned to a courier.</summary>
public sealed record AdminCourierOrderDto(
    Guid      Id,
    string    TrackingNumber,
    string    RecipientName,
    string    RecipientPhone,
    string    RecipientCity,
    string    RecipientDistrict,
    string    RecipientAddress,
    string    Status,
    decimal   CompanyServicePrice,
    decimal?  CourierSalary,
    decimal?  CompanyRevenue,
    string    OrderType,
    DateTime? DeliveredAt,
    DateTime? DeliveredToWarehouseAt,
    DateTime  CreatedAt);

/// <summary>One row of <c>GET /api/couriers/assigned</c> — an order on a courier's assigned day.</summary>
public sealed record AssignedOrderDto(
    Guid?     CourierId,
    Guid      Id,
    string    TrackingNumber,
    string    SenderBusinessName,
    string    RecipientName,
    string    RecipientPhone,
    string    RecipientCity,
    string    RecipientDistrict,
    string    RecipientAddress,
    string    Status,
    decimal   CompanyServicePrice,
    decimal?  AmountToCollectForPackage,
    decimal?  CourierSalary,
    decimal?  CourierSalaryPaidAmount,
    decimal?  CompanyRevenue,
    string    OrderType,
    DateTime? AssignedToCourierAt,
    DateTime? DeliveredAt,
    DateTime? DeliveredToWarehouseAt,
    DateTime  CreatedAt);

/// <summary>One row of <c>GET /api/couriers/assigned-pickups</c> — a batch on a pickup courier's day.</summary>
public sealed record AssignedPickupDto(
    Guid?     CourierId,
    Guid      Id,
    string    SenderBusinessName,
    string    SenderPhone,
    string    PickUpCity,
    string    PickUpDistrict,
    string    PickUpAddress,
    int       NumberOfPackages,
    string    Status,
    DateTime? PickedUpAt,
    DateTime  CreatedAt);

/// <summary>
/// The data behind the per-courier assigned-day Excel manifest. City/district are already
/// resolved to the requested language; <see cref="ExpectedCash"/> is
/// <c>OrderFinance.ExpectedCourierCash</c>. The workbook itself is built in the API layer.
/// </summary>
public sealed record AssignedOrdersExportDto(string? CourierName, IReadOnlyList<AssignedOrderExportRow> Rows);

public sealed record AssignedOrderExportRow(
    DateTime CreatedAt,
    string   SenderName,
    string   City,
    string   District,
    string   Address,
    string   RecipientName,
    string   Description,
    string   Phone,
    decimal  ExpectedCash,
    decimal  CompanyServicePrice);
