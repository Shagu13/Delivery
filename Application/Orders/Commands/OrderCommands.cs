using MediatR;

namespace Application.Orders.Commands;

/// <summary>Admin marks a non-Tbilisi order as dispatched to recipient's city.</summary>
public sealed record SendOrderToCityCommand(Guid OrderId) : IRequest;

/// <summary>Admin assigns last-mile delivery courier.</summary>
public sealed record AssignCourierToOrderCommand(Guid OrderId, Guid CourierId) : IRequest;

/// <summary>Courier confirms receipt of order for last-mile delivery. Order → CourierRecievedOrderToDeliver.</summary>
public sealed record MarkOrderReceivedCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>
/// Courier confirms delivery to recipient. Order → DeliveredToRecipient.
/// (The intermediate OrderIsBeingDeliveredToRecipient step has been removed — courier
/// goes directly from CourierRecievedOrderToDeliver to DeliveredToRecipient.)
/// </summary>
public sealed record MarkOrderDeliveredCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Admin cancels any single order at any stage. Order → CancelledByAdmin.</summary>
public sealed record CancelOrderByAdminCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin sets (or updates) the courier salary for a specific order.
/// CompanyRevenue is auto-calculated as CompanyServicePrice - CourierSalary.
/// </summary>
public sealed record SetCourierSalaryCommand(Guid OrderId, decimal Salary) : IRequest;

/// <summary>Admin overrides the company service price for a specific order.</summary>
public sealed record SetOrderCompanyServicePriceCommand(Guid OrderId, decimal Price) : IRequest;

/// <summary>Admin sets (or updates) the default company service price for a district.</summary>
public sealed record SetDistrictCompanyServicePriceCommand(Guid DistrictId, decimal? Price) : IRequest;

/// <summary>
/// Admin sets the territory classification for a district.
/// IsCapitalTerritory and IsCityTerritory are mutually exclusive.
/// </summary>
public sealed record SetDistrictTerritoryCommand(Guid DistrictId, bool IsCapitalTerritory, bool IsCityTerritory) : IRequest;
