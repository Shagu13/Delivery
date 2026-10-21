using Domain.Enums;
using MediatR;

namespace Application.Orders.Commands;

/// <summary>Admin marks a non-Tbilisi order as dispatched to recipient's city.</summary>
public sealed record SendOrderToCityCommand(Guid OrderId) : IRequest;

/// <summary>Admin assigns last-mile delivery courier.</summary>
public sealed record AssignCourierToOrderCommand(Guid OrderId, Guid CourierId) : IRequest;

/// <summary>
/// Admin bulk-assigns a courier to many orders at once (Send/Exchange delivery orders and
/// standalone Return pickups may be mixed in one call — each is routed to the matching flow).
/// A single DB round trip for the whole batch instead of one request per order; notifications
/// are still sent per order but run in the background (see IOrderAssignmentNotifier).
/// </summary>
public sealed record BulkAssignCourierToOrdersCommand(
    IReadOnlyList<Guid> OrderIds, Guid CourierId) : IRequest<BulkAssignCourierResultDto>;

public sealed record BulkAssignCourierResultDto(
    IReadOnlyList<Guid> Succeeded,
    IReadOnlyList<BulkAssignFailureDto> Failed);

public sealed record BulkAssignFailureDto(Guid OrderId, string Error);

/// <summary>
/// Courier confirms delivery to recipient. Order → DeliveredToRecipient.
/// <paramref name="UpdatedCodAmount"/> lets the courier correct the parcel COD amount at the
/// door (e.g. the recipient negotiated a different price than the sender originally set) —
/// when supplied it overwrites <c>Order.AmountToCollectForPackage</c> before cash collection
/// is computed.
/// </summary>
public sealed record MarkOrderDeliveredCommand(Guid OrderId, string CourierUserId, decimal? UpdatedCodAmount = null) : IRequest;

/// <summary>
/// Courier confirms delivery for an order whose recipient had already paid the SENDER
/// directly. The product COD is zeroed (the company collected nothing, so it owes the
/// sender nothing for it). When <paramref name="ServiceFeeAlsoPaidToSender"/> is true the
/// service fee flips to Sender-owed (a customer receivable); otherwise the courier collected
/// the fee in cash.
/// </summary>
public sealed record MarkOrderDeliveredPaidToSenderCommand(
    Guid OrderId, string CourierUserId, bool ServiceFeeAlsoPaidToSender) : IRequest;

/// <summary>Courier marks a delivery attempt as failed. Order → DeliveryPostponed.
/// Comment is only kept for the "Other" reason.</summary>
public sealed record PostponeOrderCommand(Guid OrderId, string CourierUserId, PostponeReason Reason, string? Comment = null) : IRequest;

/// <summary>Admin postpones an assigned delivery (no courier identity). Order → DeliveryPostponed.
/// Comment is only kept for the "Other" reason.</summary>
public sealed record AdminPostponeOrderCommand(Guid OrderId, PostponeReason Reason, string? Comment = null) : IRequest;

/// <summary>Courier retries a postponed delivery. Order → CourierDeliveringTheOrderToRecipient.</summary>
public sealed record RetryDeliveryCommand(Guid OrderId, string CourierUserId) : IRequest;

/// <summary>
/// Courier cancels a delivery because the recipient declined the parcel. Order → OrderNotAccepted.
/// Comment is only kept for the "Other" reason.
/// </summary>
public sealed record CancelOrderByCourierCommand(
    Guid OrderId, string CourierUserId, CancellationReason Reason, string? Comment) : IRequest;

/// <summary>
/// Admin cancels any single order at any stage. Order → CancelledByAdmin.
/// When <paramref name="Reason"/> is null this is a plain (non-billable) cancellation — used to
/// kill an order early without charging. When a (non-warehouse) <paramref name="Reason"/> is given
/// it is a "cancel &amp; charge" — the order must have reached a delivery courier, the sender is
/// invoiced the service fee and the courier earns their salary, mirroring the courier's own
/// cancel-with-reason (OrderFinance.IsBillableFailedDelivery keys off CancellationReason).
/// Comment is only kept for the "Other" reason.
/// </summary>
public sealed record CancelOrderByAdminCommand(
    Guid OrderId, CancellationReason? Reason = null, string? Comment = null) : IRequest;

/// <summary>
/// Admin marks a Send/Exchange order whose delivery failed (recipient refused / wanted to
/// cancel mid-delivery) as returned to the sender. Order → ReturnedToSender. Mirrors the
/// Return-order "mark returned to sender" action; the sender still owes the company service
/// fee and the courier still earns salary (OrderFinance.IsBillableFailedDelivery).
/// </summary>
public sealed record MarkSendReturnedToSenderCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin marks an already-cancelled Send/Exchange order — cancelled by admin
/// (<see cref="Domain.Enums.OrderStatus.CancelledByAdmin"/>) or declined by a courier
/// (<see cref="Domain.Enums.OrderStatus.OrderNotAccepted"/>) — as physically returned to the
/// sender. Records <see cref="Domain.Order.CancelledReturnedToSenderAt"/>. The order keeps its
/// cancelled Status and its billing is unchanged (finance keys off CancellationReason, not this
/// marker). Standalone Returns are excluded — they run their own returned-to-sender flow.
/// </summary>
public sealed record MarkCancelledReturnedToSenderCommand(Guid OrderId) : IRequest;

/// <summary>
/// Admin undoes a courier's mistaken terminal status and returns the order to the last-mile
/// flow:
///  • <see cref="OrderStatusCorrection.UnCancel"/> — order was cancelled by mistake
///    (e.g. courier cancelled instead of postponing). Goes to CourierAssignedToDeliver,
///    keeping the assigned courier, only if the order already had one; a plain admin cancel
///    (CancelOrderByAdminCommand with no Reason) is allowed before the order ever reached a
///    delivery courier, so in that case this instead lands it at AdminAcceptedOrderInWareHouse,
///    ready for a normal courier assignment.
///  • <see cref="OrderStatusCorrection.UnDeliver"/> — order was marked delivered by
///    mistake; the cash/payment recorded at delivery is cleared so settlement reconciles.
///    Always goes to CourierAssignedToDeliver, keeping the assigned courier (a delivery can't
///    complete without one).
/// Send/Exchange only — Returns use a separate pickup flow.
/// </summary>
public sealed record AdminCorrectOrderStatusCommand(Guid OrderId, OrderStatusCorrection Correction) : IRequest;

public enum OrderStatusCorrection
{
    /// <summary>Revert a cancelled order back into the delivery flow.</summary>
    UnCancel,
    /// <summary>Revert a delivered order back into the delivery flow, clearing delivery finances.</summary>
    UnDeliver,
}

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

/// <summary>
/// Admin sets an order's company service fee and its package COD together (Finance page).
/// Unlike <see cref="SetOrderCompanyServicePriceCommand"/> nothing is re-split automatically:
/// the admin decides all values. <paramref name="AmountToCollectForPackage"/> null = no COD.
/// <paramref name="CustomerSurcharge"/> is the part of the fee the sender owes on top of what the
/// recipient pays (recipient-pays orders only; 0 otherwise).
/// </summary>
public sealed record SetOrderPricesCommand(
    Guid OrderId, decimal CompanyServicePrice, decimal? AmountToCollectForPackage, decimal CustomerSurcharge = 0m) : IRequest;

/// <summary>Admin sets (or updates) the default company service price for a district.</summary>
public sealed record SetDistrictCompanyServicePriceCommand(Guid DistrictId, decimal? Price) : IRequest;

/// <summary>
/// Admin sets the territory classification for a district.
/// IsCapitalTerritory and IsCityTerritory are mutually exclusive.
/// </summary>
public sealed record SetDistrictTerritoryCommand(Guid DistrictId, bool IsCapitalTerritory, bool IsCityTerritory) : IRequest;
