using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands;

/// <summary>Admin marks a non-Tbilisi order as dispatched to recipient's city.</summary>
public sealed record SendOrderToCityCommand(Guid OrderId) : IRequest;

/// <summary>Admin assigns last-mile delivery courier.</summary>
public sealed record AssignCourierToOrderCommand(Guid OrderId, Guid CourierId) : IRequest;

/// <summary>Courier picks up the order and starts delivering. Order → CourierDeliveringTheOrderToRecipient.</summary>
public sealed record MarkOrderDeliveringCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>Courier confirms delivery to recipient. Order → DeliveredToRecipient.</summary>
public sealed record MarkOrderDeliveredCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>
/// Courier confirms delivery for an order whose recipient had already paid the SENDER
/// directly. The product COD is zeroed (the company collected nothing, so it owes the
/// sender nothing for it). When <paramref name="ServiceFeeAlsoPaidToSender"/> is true the
/// service fee flips to Sender-owed (a customer receivable); otherwise the courier collected
/// the fee in cash.
/// </summary>
public sealed record MarkOrderDeliveredPaidToSenderCommand(
    Guid OrderId, string CourierUserId, bool ServiceFeeAlsoPaidToSender) : IRequest;

/// <summary>Courier marks a delivery attempt as failed. Order → DeliveryPostponed.</summary>
public sealed record PostponeOrderCommand(Guid OrderId, string CourierUserId, PostponeReason Reason) : IRequest;

/// <summary>Courier retries a postponed delivery. Order → CourierDeliveringTheOrderToRecipient.</summary>
public sealed record RetryDeliveryCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>
/// Courier cancels a delivery because the recipient declined the parcel. Order → OrderNotAccepted.
/// Comment is only kept for the "Other" reason.
/// </summary>
public sealed record CancelOrderByCourierCommand(
    Guid OrderId, string CourierUserId, CancellationReason Reason, string? Comment) : IRequest;

/// <summary>Admin cancels any single order at any stage. Order → CancelledByAdmin.</summary>
public sealed record CancelOrderByAdminCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin force-marks a Send/Exchange order as delivered to recipient from any active status.
/// Applies the same cash-collection logic as the courier version.
/// Optionally assigns a courier (only when the order has none — so the delivery is
/// attributed for courier settlement) and/or sets the courier salary, both atomically
/// with the delivery so the finance flow stays intact.
/// </summary>
public sealed record AdminMarkOrderDeliveredCommand(
    Guid OrderId, Guid? CourierId = null, decimal? Salary = null) : IRequest;

/// <summary>
/// Admin force-marks a Return order as delivered to warehouse from any active status.
/// </summary>
public sealed record AdminMarkReturnDeliveredToWarehouseCommand(Guid OrderId) : IRequest;

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
