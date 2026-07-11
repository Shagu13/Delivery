using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
namespace Application.Orders.Commands;

// ── SendOrderToCity ───────────────────────────────────────────────────────────
public sealed class SendOrderToCityCommandHandler : IRequestHandler<SendOrderToCityCommand>
{
    private readonly IAppDbContext _context;
    public SendOrderToCityCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SendOrderToCityCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.Status != OrderStatus.AdminAcceptedOrderInWareHouse)
            throw new ConflictException($"Expected AdminAcceptedOrderInWareHouse. Current: {order.Status}.");

        const string tbilisi = "Tbilisi";
        if (order.RecipientCity.Equals(tbilisi, StringComparison.OrdinalIgnoreCase))
            throw new ConflictException("Tbilisi orders must use Assign Courier, not Send To City.");

        order.Status = OrderStatus.OrderIsOnItsWayToRecipientsCity;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── AssignCourierToOrder ──────────────────────────────────────────────────────
public sealed class AssignCourierToOrderCommandHandler : IRequestHandler<AssignCourierToOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    private readonly IOrderAssignmentNotifier _assignmentNotifier;

    public AssignCourierToOrderCommandHandler(
        IAppDbContext context,
        IRealtimeNotifier notifier,
        IOrderAssignmentNotifier assignmentNotifier)
    {
        _context = context;
        _notifier = notifier;
        _assignmentNotifier = assignmentNotifier;
    }

    public async Task Handle(AssignCourierToOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        var validStatuses = new[]
        {
            OrderStatus.AdminAcceptedOrderInWareHouse,
            OrderStatus.OrderIsOnItsWayToRecipientsCity,
            // Already assigned but not yet picked up by the courier — allow the admin to
            // re-assign it to a different courier.
            OrderStatus.CourierAssignedToDeliver,
            // Courier already has it out for delivery — still reassignable mid-flight.
            OrderStatus.CourierDeliveringTheOrderToRecipient,
            // A postponed delivery — allow the admin to reassign/retry it, same as
            // CourierAssignedToDeliver.
            OrderStatus.DeliveryPostponed,
        };

        if (!validStatuses.Contains(order.Status))
            throw new ConflictException(
                $"Cannot assign courier from status {order.Status}. " +
                "Expected AdminAcceptedOrderInWareHouse, OrderIsOnItsWayToRecipientsCity, " +
                "CourierAssignedToDeliver, CourierDeliveringTheOrderToRecipient (re-assignment), or DeliveryPostponed.");

        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        // Capture the prior assignee so a re-assignment can drop the order from
        // their active deliveries live.
        var previousCourierId = order.CourierId;

        order.CourierId = courier.Id;
        order.AssignedToCourierAt = CustomTime.Now;
        order.Status = OrderStatus.CourierAssignedToDeliver;
        // Clear stale postpone info — the order is active again under a (possibly new) courier.
        order.PostponeReason = null;
        order.PostponeComment = null;
        order.PostponedAt = null;

        // Auto-fill this courier's standard rate (Tbilisi couriers only — see
        // Courier.DefaultSalary doc comment). When null, the order's CourierSalary stays
        // untouched and the Packages page's missing-salary flow prompts the admin to set one.
        if (courier.DefaultSalary is decimal defaultSalary)
        {
            order.CourierSalary = defaultSalary;
            order.CompanyRevenue = order.CompanyServicePrice - defaultSalary;
        }

        // The separate "on the way" step was removed (courier now confirms delivery in one
        // swipe), so the warehouse-pickup stamp and the non-Tbilisi delivery-window estimate
        // are recorded here, at assignment — the start of the courier's last-mile possession.
        // Guarded so a re-assignment doesn't overwrite an already-recorded pickup/window.
        order.PickedUpFromWarehouseAt ??= order.AssignedToCourierAt;
        if (order.DeliveryDateFrom is null
            && !order.RecipientCity.Equals("Tbilisi", StringComparison.OrdinalIgnoreCase))
        {
            order.DeliveryDateFrom = order.AssignedToCourierAt.Value.Date.AddDays(1);
            order.DeliveryDateTo   = order.AssignedToCourierAt.Value.Date.AddDays(4);
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Live-refresh dashboards: the newly assigned courier (order appears),
        // the previous courier on a re-assignment (order leaves), and admins.
        _notifier.NotifyCourierOrdersChanged(courier.Id);
        if (previousCourierId is Guid prev && prev != courier.Id)
            _notifier.NotifyCourierOrdersChanged(prev);
        _notifier.NotifyAdminsOrdersChanged();

        // Heads-up push + recipient SMS for the courier's new delivery — real external
        // network calls, run in the background (see IOrderAssignmentNotifier) so a slow
        // gateway never adds to this request's latency. Only on a genuinely new
        // assignment (not a re-assign back to the same courier).
        if (previousCourierId != courier.Id)
        {
            _assignmentNotifier.NotifyCourierAssigned(
                courier.Id,
                order.RecipientPhone,
                order.TrackingNumber,
                order.GroupOrder?.SenderBusinessName,
                order.RecipientCity,
                order.RecipientDistrict);
        }
    }
}

// ── BulkAssignCourierToOrders ───────────────────────────────────────────────────
// One DB round trip for the whole batch (instead of the admin UI firing one HTTP
// request per order): a single SaveChangesAsync covers every order, so the
// SaveChanges interceptors (realtime dashboard pings, partner webhook outbox check)
// also run once for the batch instead of once per order. Push/SMS notifications are
// still one per newly assigned order, but run in the background via
// IOrderAssignmentNotifier so they never gate the response.
public sealed class BulkAssignCourierToOrdersCommandHandler
    : IRequestHandler<BulkAssignCourierToOrdersCommand, BulkAssignCourierResultDto>
{
    private static readonly OrderStatus[] ValidSendStatuses =
    {
        OrderStatus.AdminAcceptedOrderInWareHouse,
        OrderStatus.OrderIsOnItsWayToRecipientsCity,
        // Already assigned but not yet picked up by the courier — allow the admin to
        // re-assign it to a different courier.
        OrderStatus.CourierAssignedToDeliver,
        // Courier already has it out for delivery — still reassignable mid-flight.
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        // A postponed delivery — allow the admin to reassign/retry it.
        OrderStatus.DeliveryPostponed,
    };

    private readonly IAppDbContext _context;
    private readonly IOrderAssignmentNotifier _assignmentNotifier;

    public BulkAssignCourierToOrdersCommandHandler(
        IAppDbContext context, IOrderAssignmentNotifier assignmentNotifier)
    {
        _context = context;
        _assignmentNotifier = assignmentNotifier;
    }

    public async Task<BulkAssignCourierResultDto> Handle(
        BulkAssignCourierToOrdersCommand request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        var requestedIds = request.OrderIds.Distinct().ToList();

        var orders = await _context.Orders
            .Include(o => o.GroupOrder)
            .Where(o => requestedIds.Contains(o.Id))
            .ToListAsync(cancellationToken);

        var succeeded = new List<Guid>();
        var failed = new List<BulkAssignFailureDto>();
        var toNotify = new List<(Guid CourierId, string Phone, string Tracking, string? Business, string City, string District)>();

        var foundIds = orders.Select(o => o.Id).ToHashSet();
        foreach (var missingId in requestedIds.Where(id => !foundIds.Contains(id)))
            failed.Add(new BulkAssignFailureDto(missingId, "Order not found."));

        var now = CustomTime.Now;

        foreach (var order in orders)
        {
            if (order.OrderType == OrderType.Return)
            {
                order.CourierId = courier.Id;
                order.AssignedToCourierAt = now;
                order.Status = OrderStatus.CourierAssignedToPickUp;
                succeeded.Add(order.Id);
                continue;
            }

            if (!ValidSendStatuses.Contains(order.Status))
            {
                failed.Add(new BulkAssignFailureDto(
                    order.Id, $"Cannot assign courier from status {order.Status}."));
                continue;
            }

            // Capture the prior assignee so a re-assignment can drop the order from
            // their active deliveries live (RealtimeDashboardInterceptor pings both).
            var previousCourierId = order.CourierId;

            order.CourierId = courier.Id;
            order.AssignedToCourierAt = now;
            order.Status = OrderStatus.CourierAssignedToDeliver;
            // Clear stale postpone info — the order is active again under a (possibly new) courier.
            order.PostponeReason = null;
            order.PostponeComment = null;
            order.PostponedAt = null;

            // Auto-fill this courier's standard rate — mirrors AssignCourierToOrderCommandHandler.
            if (courier.DefaultSalary is decimal defaultSalary)
            {
                order.CourierSalary = defaultSalary;
                order.CompanyRevenue = order.CompanyServicePrice - defaultSalary;
            }

            // Guarded so a re-assignment doesn't overwrite an already-recorded pickup/window —
            // mirrors AssignCourierToOrderCommandHandler.
            order.PickedUpFromWarehouseAt ??= order.AssignedToCourierAt;
            if (order.DeliveryDateFrom is null
                && !order.RecipientCity.Equals("Tbilisi", StringComparison.OrdinalIgnoreCase))
            {
                order.DeliveryDateFrom = now.Date.AddDays(1);
                order.DeliveryDateTo   = now.Date.AddDays(4);
            }

            succeeded.Add(order.Id);

            // Only on a genuinely new assignment (not a re-assign back to the same courier).
            if (previousCourierId != courier.Id)
            {
                toNotify.Add((
                    courier.Id, order.RecipientPhone, order.TrackingNumber,
                    order.GroupOrder?.SenderBusinessName, order.RecipientCity, order.RecipientDistrict));
            }
        }

        if (succeeded.Count > 0)
            await _context.SaveChangesAsync(cancellationToken);

        // Realtime admin/courier dashboard pings fire once for the whole batch via
        // RealtimeDashboardInterceptor (reacts to the CourierId changes above) — no need
        // to call IRealtimeNotifier explicitly here.
        foreach (var n in toNotify)
            _assignmentNotifier.NotifyCourierAssigned(n.CourierId, n.Phone, n.Tracking, n.Business, n.City, n.District);

        return new BulkAssignCourierResultDto(succeeded, failed);
    }
}

// ── Shared helper ─────────────────────────────────────────────────────────────
file static class OrderCourierGuard
{
    internal static async Task<(Domain.Order order, Domain.Courier courier)> LoadAndVerifyAsync(
        IAppDbContext context,
        Guid orderId,
        string courierUserId,
        CancellationToken ct)
    {
        var courier = await context.Couriers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == courierUserId, ct)
            ?? throw new NotFoundException("Courier", courierUserId);

        var order = await context.Orders
            .FirstOrDefaultAsync(o => o.Id == orderId, ct)
            ?? throw new NotFoundException("Order", orderId);

        if (order.CourierId != courier.Id)
            throw new ForbiddenException("This order is not assigned to you.");

        return (order, courier);
    }
}

// ── MarkOrderDelivered ────────────────────────────────────────────────────────
public sealed class MarkOrderDeliveredCommandHandler : IRequestHandler<MarkOrderDeliveredCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderDeliveredCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderDeliveredCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        // The separate "on the way" step was removed — couriers confirm delivery in one swipe
        // from CourierAssignedToDeliver. CourierDeliveringTheOrderToRecipient is still accepted
        // for any orders left mid-flight under the old two-step process.
        if (order.Status is not (OrderStatus.CourierAssignedToDeliver
                              or OrderStatus.CourierDeliveringTheOrderToRecipient))
            throw new ConflictException($"Expected CourierAssignedToDeliver. Current: {order.Status}.");

        // Capture payment status before marking paid, so the cash-collection logic below
        // still knows whether the product was unpaid at the time of delivery.
        var wasNotPaid = order.ProductPaymentStatus == PaymentStatus.NotPaid;

        // The courier corrected the parcel COD amount at the door (e.g. the recipient
        // negotiated a different price than the sender originally set) — only meaningful
        // while the product is still unpaid/COD. Persisted onto the order so the cash
        // collected below, and any later finance reporting, reflect the actual amount.
        if (wasNotPaid && request.UpdatedCodAmount is { } updatedAmount && updatedAmount >= 0)
            order.AmountToCollectForPackage = updatedAmount;

        order.Status = OrderStatus.DeliveredToRecipient;
        order.ProductPaymentStatus = PaymentStatus.Paid;

        // Auto-populate AmountOfCashCollected when the recipient is paying cash on delivery.
        // Case 1 — Recipient pays fee, product unpaid: collect product amount + courier fee.
        // Case 2 — Recipient pays fee, product pre-paid: collect courier fee only.
        // Case 3 — Sender pays fee, product has COD: collect product amount only (no service fee in cash).
        if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
        {
            if (wasNotPaid && order.AmountToCollectForPackage.HasValue)
            {
                order.AmountOfCashCollected = order.AmountToCollectForPackage.Value
                                            + order.CompanyServicePrice;
            }
            else if (!wasNotPaid)
            {
                order.AmountOfCashCollected = order.CompanyServicePrice;
            }

            // Courier collected the service fee in cash from the recipient at the door.
            // Mark it as paid immediately for Recipient-payer orders.
            order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        }
        else if (order.WhoPaysForCompanyService == ServicePayer.Sender
              && order.AmountToCollectForPackage.HasValue
              && order.AmountToCollectForPackage.Value > 0)
        {
            // Sender-payer order with COD: courier collects the package amount from recipient.
            // The service fee is NOT collected here — the sender pays it separately.
            order.AmountOfCashCollected = order.AmountToCollectForPackage.Value;
        }

        order.DeliveredAt = CustomTime.Now;
        order.PostponeReason = null;
        order.PostponeComment = null;
        await _context.SaveChangesAsync(cancellationToken);


        // Auto-close the parent GroupOrder when all packages are done
        // (standalone Return orders have no GroupOrderId — skip)
        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);
    }
}

// ── MarkOrderDeliveredPaidToSender ────────────────────────────────────────────
// Delivery done, but the recipient had already paid the sender directly.
public sealed class MarkOrderDeliveredPaidToSenderCommandHandler
    : IRequestHandler<MarkOrderDeliveredPaidToSenderCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderDeliveredPaidToSenderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderDeliveredPaidToSenderCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status is not (OrderStatus.CourierAssignedToDeliver
                              or OrderStatus.CourierDeliveringTheOrderToRecipient))
            throw new ConflictException($"Expected CourierAssignedToDeliver. Current: {order.Status}.");

        order.Status = OrderStatus.DeliveredToRecipient;

        // Product was paid straight to the sender → the company collected nothing for it,
        // so it owes the sender nothing. Zero the COD and mark the product paid.
        order.ProductPaymentStatus      = PaymentStatus.Paid;
        order.AmountToCollectForPackage = 0;

        if (order.WhoPaysForCompanyService == ServicePayer.Recipient && order.CompanyServicePrice > 0)
        {
            if (request.ServiceFeeAlsoPaidToSender)
            {
                // The recipient gave the fee to the sender too → the sender now owes the
                // company the fee (a customer receivable). No cash through the courier.
                order.WhoPaysForCompanyService    = ServicePayer.Sender;
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Unpaid;
                order.AmountOfCashCollected       = 0;
            }
            else
            {
                // Recipient still handed the service fee to the courier in cash.
                order.AmountOfCashCollected       = order.CompanyServicePrice;
                order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
            }
        }
        else
        {
            // Sender already pays the fee (or there is none) → nothing collected in cash.
            order.AmountOfCashCollected = 0;
        }

        order.DeliveredAt    = CustomTime.Now;
        order.PostponeReason = null;
        order.PostponeComment = null;
        await _context.SaveChangesAsync(cancellationToken);


        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);
    }
}

// ── PostponeOrder ─────────────────────────────────────────────────────────────
public sealed class PostponeOrderCommandHandler : IRequestHandler<PostponeOrderCommand>
{
    private readonly IAppDbContext _context;
    public PostponeOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(PostponeOrderCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status is not (OrderStatus.CourierAssignedToDeliver
                              or OrderStatus.CourierDeliveringTheOrderToRecipient))
            throw new ConflictException($"Expected CourierAssignedToDeliver. Current: {order.Status}.");

        order.Status = OrderStatus.DeliveryPostponed;
        order.PostponeReason = request.Reason;
        order.PostponeComment = request.Reason == PostponeReason.Other
            ? (string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim())
            : null;
        order.PostponedAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── AdminPostponeOrder ────────────────────────────────────────────────────────
// Admin postpones a delivery from the Delivery/Packages pages — same effect as the
// courier action but without a courier identity (the order keeps its assigned courier).
public sealed class AdminPostponeOrderCommandHandler : IRequestHandler<AdminPostponeOrderCommand>
{
    private readonly IAppDbContext _context;
    public AdminPostponeOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AdminPostponeOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.Status is not (OrderStatus.CourierAssignedToDeliver
                              or OrderStatus.CourierDeliveringTheOrderToRecipient))
            throw new ConflictException($"Can only postpone an assigned delivery. Current: {order.Status}.");

        order.Status         = OrderStatus.DeliveryPostponed;
        order.PostponeReason = request.Reason;
        order.PostponeComment = request.Reason == PostponeReason.Other
            ? (string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim())
            : null;
        order.PostponedAt    = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── RetryDelivery ─────────────────────────────────────────────────────────────
public sealed class RetryDeliveryCommandHandler : IRequestHandler<RetryDeliveryCommand>
{
    private readonly IAppDbContext _context;
    public RetryDeliveryCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(RetryDeliveryCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status != OrderStatus.DeliveryPostponed)
            throw new ConflictException($"Expected DeliveryPostponed. Current: {order.Status}.");

        order.Status = OrderStatus.CourierAssignedToDeliver;
        order.PostponeReason = null;
        order.PostponeComment = null;
        order.PostponedAt = null;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── CancelOrderByCourier ──────────────────────────────────────────────────────
// Courier cancels a delivery because the recipient declined the parcel.
public sealed class CancelOrderByCourierCommandHandler : IRequestHandler<CancelOrderByCourierCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public CancelOrderByCourierCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task Handle(CancelOrderByCourierCommand request, CancellationToken cancellationToken)
    {
        var (order, courier) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status is not (OrderStatus.CourierAssignedToDeliver
                              or OrderStatus.CourierDeliveringTheOrderToRecipient
                              or OrderStatus.DeliveryPostponed))
            throw new ConflictException($"Cannot cancel from status {order.Status}.");

        order.Status              = OrderStatus.OrderNotAccepted;
        order.CancellationReason  = request.Reason;
        order.CancellationComment = request.Reason == CancellationReason.Other
            ? (string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim())
            : null;
        order.CancelledAt         = CustomTime.Now;
        // Clear any postpone state — this is now terminal.
        order.PostponeReason      = null;
        order.PostponeComment     = null;
        order.PostponedAt         = null;

        await _context.SaveChangesAsync(cancellationToken);


        // Close the parent batch if every package is now done (skip standalone Returns).
        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);

        _notifier.NotifyCourierOrdersChanged(courier.Id);
        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── CancelOrderByAdmin ────────────────────────────────────────────────────────
public sealed class CancelOrderByAdminCommandHandler : IRequestHandler<CancelOrderByAdminCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public CancelOrderByAdminCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(CancelOrderByAdminCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Cannot cancel an already-delivered order
        if (order.Status == OrderStatus.DeliveredToRecipient)
            throw new ConflictException("Cannot cancel an order that has already been delivered.");

        if (order.Status == OrderStatus.CancelledByAdmin)
            throw new ConflictException("Order is already cancelled.");

        // Remember who had it so their open dashboard can drop it live.
        var assignedCourierId = order.CourierId;

        // "Cancel & charge": an explicit (non-warehouse) reason makes this a billable failed
        // delivery (OrderFinance.IsBillableFailedDelivery keys off CancellationReason) — the sender
        // is invoiced the fee and the courier earns salary. Guarded so it can only be applied once
        // the order genuinely reached a delivery courier. A null reason is a plain, no-charge cancel.
        if (request.Reason is CancellationReason reason)
        {
            if (reason == CancellationReason.WarehouseNotReceived)
                throw new ConflictException("WarehouseNotReceived is set during warehouse acceptance, not here.");
            if (order.AssignedToCourierAt is null)
                throw new ConflictException("Can only cancel & charge an order that reached a delivery courier.");

            order.CancellationReason  = reason;
            order.CancellationComment = reason == CancellationReason.Other
                ? (string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim())
                : null;
        }

        order.Status = OrderStatus.CancelledByAdmin;
        // Stamp the cancellation time so it can be dated into finance ranges.
        order.CancelledAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);


        // Auto-close the parent GroupOrder when all packages are done
        // (standalone Return orders have no GroupOrderId — skip)
        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);

        // Live-refresh dashboards: the assigned courier (so the cancelled order
        // leaves their active deliveries) and admins.
        if (assignedCourierId is Guid courierId)
            _notifier.NotifyCourierOrdersChanged(courierId);
        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── MarkSendReturnedToSender ──────────────────────────────────────────────────
// Admin marks a Send/Exchange order whose delivery failed (recipient refused) as returned to
// the sender. Mirrors the Return-order action; the sender still owes the service fee and the
// courier still earns salary (OrderFinance.IsBillableFailedDelivery keys off this terminal).
public sealed class MarkSendReturnedToSenderCommandHandler : IRequestHandler<MarkSendReturnedToSenderCommand>
{
    private static readonly OrderStatus[] AllowedFrom =
    {
        OrderStatus.CourierAssignedToDeliver,
        OrderStatus.CourierDeliveringTheOrderToRecipient,
        OrderStatus.DeliveryPostponed,
        OrderStatus.OrderNotAccepted, // courier already declined → admin formalises the return
    };

    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public MarkSendReturnedToSenderCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task Handle(MarkSendReturnedToSenderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.OrderType == OrderType.Return)
            throw new ConflictException("Returns use their own returned-to-sender action.");

        if (order.AssignedToCourierAt is null || !AllowedFrom.Contains(order.Status))
            throw new ConflictException(
                $"Can only return-to-sender a Send/Exchange order that reached a delivery courier. Current: {order.Status}.");

        var assignedCourierId = order.CourierId;

        order.Status      = OrderStatus.ReturnedToSender;
        order.DeliveredAt = CustomTime.Now;   // dates the billing/settlement event into finance ranges
        // Record an explicit billable reason so the sender is invoiced the fee — finance keys off
        // CancellationReason (OrderFinance.IsBillableFailedDelivery). Keep any reason the courier
        // already chose when declining; otherwise mark it a generic return.
        order.CancellationReason ??= CancellationReason.Other;
        // Clear any postpone state — this is now terminal.
        order.PostponeReason = null;
        order.PostponeComment = null;
        order.PostponedAt    = null;
        await _context.SaveChangesAsync(cancellationToken);

        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);

        if (assignedCourierId is Guid courierId)
            _notifier.NotifyCourierOrdersChanged(courierId);
        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── MarkCancelledReturnedToSender ─────────────────────────────────────────────
// Admin adds a final logistics step onto an already-cancelled Send/Exchange order (cancelled by
// admin, or declined by a courier → OrderNotAccepted): the parcel was physically handed back to
// the sender. This only stamps CancelledReturnedToSenderAt — the order keeps its cancelled Status
// and CancellationReason, so all finance (billable-failed etc.) is unchanged.
public sealed class MarkCancelledReturnedToSenderCommandHandler : IRequestHandler<MarkCancelledReturnedToSenderCommand>
{
    private static readonly OrderStatus[] AllowedFrom =
    {
        OrderStatus.CancelledByAdmin,   // admin cancelled
        OrderStatus.OrderNotAccepted,   // courier declined
    };

    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public MarkCancelledReturnedToSenderCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task Handle(MarkCancelledReturnedToSenderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.OrderType == OrderType.Return)
            throw new ConflictException("Returns use their own returned-to-sender action.");

        if (!AllowedFrom.Contains(order.Status))
            throw new ConflictException(
                $"Only an admin- or courier-cancelled order can be marked returned to sender. Current: {order.Status}.");

        // Markable as long as the order carries a real cancellation reason (any of the enum
        // values) — that signals it was received then cancelled. A null reason is a plain early
        // cancel with nothing to hand back.
        if (order.CancellationReason is null)
            throw new ConflictException(
                "Only a cancelled order that has a cancellation reason can be marked returned to sender.");

        // Logistics-only marker — Status, CancellationReason and all finance stay as-is.
        order.CancelledReturnedToSenderAt = CustomTime.Now;
        await _context.SaveChangesAsync(cancellationToken);

        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── AdminCorrectOrderStatus ───────────────────────────────────────────────────
// Admin undoes a courier's mistaken terminal status: a cancel that should have been a
// postpone (UnCancel), or a delivery that should not have happened (UnDeliver). Both
// return the order to CourierAssignedToDeliver so the courier can re-attempt; UnDeliver
// also clears the cash/payment the delivery recorded so settlement totals reconcile.
public sealed class AdminCorrectOrderStatusCommandHandler : IRequestHandler<AdminCorrectOrderStatusCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public AdminCorrectOrderStatusCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context  = context;
        _notifier = notifier;
    }

    public async Task Handle(AdminCorrectOrderStatusCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Both corrections put the order back into the last-mile delivery flow, which is a
        // Send/Exchange concept — standalone Returns run a different (pickup) flow.
        if (order.OrderType == OrderType.Return)
            throw new ConflictException("Status correction is only available for Send/Exchange orders.");

        switch (request.Correction)
        {
            case OrderStatusCorrection.UnCancel:
                if (order.Status is not (OrderStatus.OrderNotAccepted
                                      or OrderStatus.CancelledByAdmin
                                      or OrderStatus.CancelledBySender))
                    throw new ConflictException($"Only a cancelled order can be un-cancelled. Current: {order.Status}.");

                order.CancellationReason  = null;
                order.CancellationComment = null;
                order.CancelledAt         = null;
                break;

            case OrderStatusCorrection.UnDeliver:
                if (order.Status is not (OrderStatus.DeliveredToRecipient or OrderStatus.ExchangeCompleted))
                    throw new ConflictException($"Only a delivered order can be un-delivered. Current: {order.Status}.");

                // Clear everything the delivery stamped so the courier's cash reconciles.
                order.DeliveredAt           = null;
                order.AmountOfCashCollected = null;
                // COD orders go back to "pending collection"; pre-paid orders stay paid.
                order.ProductPaymentStatus  = (order.AmountToCollectForPackage ?? 0m) > 0
                    ? PaymentStatus.NotPaid
                    : PaymentStatus.Paid;
                // The recipient-paid service fee was marked collected at the door — undo that.
                if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
                    order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Unpaid;
                break;
        }

        // Common: clear any postpone state and return to the assigned-to-deliver step.
        order.PostponeReason = null;
        order.PostponeComment = null;
        order.PostponedAt    = null;
        order.Status         = OrderStatus.CourierAssignedToDeliver;

        await _context.SaveChangesAsync(cancellationToken);

        // The parent batch may have auto-closed when this order went terminal; reopen it
        // since a package is back in the active flow.
        if (order.GroupOrderId.HasValue)
            await GroupOrderReopener.TryReopenAsync(_context, order.GroupOrderId.Value, cancellationToken);

        // Live-refresh dashboards: the assigned courier (order returns to their list) + admins.
        if (order.CourierId is Guid courierId)
            _notifier.NotifyCourierOrdersChanged(courierId);
        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── Shared: reopen an auto-closed GroupOrder ──────────────────────────────────
file static class GroupOrderReopener
{
    internal static async Task TryReopenAsync(IAppDbContext context, Guid groupOrderId, CancellationToken ct)
    {
        var groupOrder = await context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == groupOrderId, ct);
        if (groupOrder is null) return;

        // Only auto-closed batches need reopening; one package is back in the last-mile
        // flow, so the batch is no longer fully terminal. Drop it back to the warehouse
        // hand-off point where the per-order flow begins.
        if (groupOrder.Status is OrderStatus.AllDelivered or OrderStatus.CancelledByAdmin)
        {
            groupOrder.Status = OrderStatus.AdminAcceptedOrderInWareHouse;
            await context.SaveChangesAsync(ct);
        }
    }
}

// ── CancelOrderByCustomer ─────────────────────────────────────────────────────
public sealed class CancelOrderByCustomerCommandHandler : IRequestHandler<CancelOrderByCustomerCommand>
{
    private readonly IAppDbContext _context;
    private readonly IRealtimeNotifier _notifier;
    public CancelOrderByCustomerCommandHandler(IAppDbContext context, IRealtimeNotifier notifier)
    {
        _context = context;
        _notifier = notifier;
    }

    public async Task Handle(CancelOrderByCustomerCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .Include(o => o.GroupOrder)
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // Ownership covers both paths: Send/Exchange (and batch Returns) belong via
        // GroupOrder.CustomerId; standalone Return orders own the customer directly.
        var ownsViaGroup = order.GroupOrder is not null && order.GroupOrder.CustomerId == request.CustomerId;
        var ownsDirectly = order.CustomerId == request.CustomerId;
        if (!ownsViaGroup && !ownsDirectly)
            throw new ForbiddenException("You can only cancel your own orders.");

        // Cancellable per-package up until the parcel is handed to a courier for
        // last-mile delivery (CourierAssignedToDeliver onward is locked).
        if (!CustomerOrderActionPolicy.EditableOrCancellable.Contains(order.Status))
            throw new ConflictException("This order can no longer be cancelled.");

        // Remember who (if anyone) had it so their open dashboard can drop it live.
        var assignedCourierId = order.CourierId;

        order.Status = OrderStatus.CancelledBySender;
        await _context.SaveChangesAsync(cancellationToken);


        // Auto-close the parent GroupOrder when all packages are now terminal.
        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);

        // Live-refresh dashboards: the assigned courier (so the cancelled order
        // leaves their list) and admins.
        if (assignedCourierId is Guid courierId)
            _notifier.NotifyCourierOrdersChanged(courierId);
        _notifier.NotifyAdminsOrdersChanged();
    }
}

// ── Shared: auto-close GroupOrder ─────────────────────────────────────────────
file static class GroupOrderCloser
{
    private static readonly OrderStatus[] TerminalStatuses =
    {
        OrderStatus.DeliveredToRecipient,
        OrderStatus.CancelledByAdmin,
        OrderStatus.CancelledBySender,
        // A last-mile delivery that ended at the recipient without success is terminal too:
        // the courier declined it (OrderNotAccepted) or the admin returned it to the sender.
        OrderStatus.OrderNotAccepted,
        OrderStatus.ReturnedToSender,
    };

    internal static async Task TryCloseGroupOrderAsync(
        IAppDbContext context,
        Guid groupOrderId,
        CancellationToken ct)
    {
        var allStatuses = await context.Orders
            .Where(o => o.GroupOrderId == groupOrderId)
            .Select(o => o.Status)
            .ToListAsync(ct);

        if (allStatuses.Count == 0) return;
        if (!allStatuses.All(s => TerminalStatuses.Contains(s))) return;

        var groupOrder = await context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == groupOrderId, ct);

        if (groupOrder is null) return;

        // The batch is closed once every package is terminal. Choose the closing status
        // from the actual outcomes so a fully-cancelled batch reads "Cancelled" rather than
        // "Delivered". A batch with at least one delivered package closes as AllDelivered;
        // a mixed delivered/cancelled batch is surfaced as "Delivered / Cancelled" by the UI
        // from the per-order statuses.
        var closedStatus = allStatuses.Any(s => s == OrderStatus.DeliveredToRecipient)
            ? OrderStatus.AllDelivered
            : OrderStatus.CancelledByAdmin;

        if (groupOrder.Status == closedStatus) return;

        groupOrder.Status = closedStatus;
        await context.SaveChangesAsync(ct);
    }
}

// ── SetCourierSalary ──────────────────────────────────────────────────────────
public sealed class SetCourierSalaryCommandHandler : IRequestHandler<SetCourierSalaryCommand>
{
    private readonly IAppDbContext _context;
    public SetCourierSalaryCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCourierSalaryCommand request, CancellationToken cancellationToken)
    {
        if (request.Salary < 0)
            throw new ValidationException(new[] {
                new FluentValidation.Results.ValidationFailure("Price", "Company price must be a non-negative value.")
            });

        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        order.CourierSalary = request.Salary;
        order.CompanyRevenue = order.CompanyServicePrice - request.Salary;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── SetOrderCompanyServicePrice ───────────────────────────────────────────────
public sealed class SetOrderCompanyServicePriceCommandHandler : IRequestHandler<SetOrderCompanyServicePriceCommand>
{
    private readonly IAppDbContext _context;
    public SetOrderCompanyServicePriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetOrderCompanyServicePriceCommand request, CancellationToken cancellationToken)
    {
        if (request.Price < 0)
            throw new ValidationException(new[] {
                new FluentValidation.Results.ValidationFailure("Price", "Company service price must be a non-negative value.")
            });

        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        // ── All-in pricing: keep the customer's entered total constant ─────────
        // For an order whose price was entered all-in (service fee bundled in), the
        // stored COD is the product remainder and CompanyServicePrice is the fee slice;
        // together they are the all-in total the customer committed to. When an admin
        // sets/modifies the fee, re-slice so that total stays fixed:
        //   newProduct = (currentProduct + currentFee) − newFee.
        // Without this the total would drift (e.g. fee 0 → 12 turns a 100 all-in into 112).
        if (order.IsCompanyServicePriceIncluded && order.AmountToCollectForPackage is decimal product)
        {
            var allInTotal = product + order.CompanyServicePrice;
            if (request.Price > allInTotal)
                throw new ValidationException(new[] {
                    new FluentValidation.Results.ValidationFailure("Price",
                        $"The service fee ({request.Price:0.##}) cannot exceed the all-in price ({allInTotal:0.##}).")
                });
            order.AmountToCollectForPackage = allInTotal - request.Price;
        }

        order.CompanyServicePrice = request.Price;

        // Recalculate revenue if courier salary already set
        if (order.CourierSalary.HasValue)
            order.CompanyRevenue = order.CompanyServicePrice - order.CourierSalary.Value;

        // If the order is already delivered, re-derive the physical cash the courier
        // collected from the corrected fee (recipient-pays bundles the fee into the cash;
        // sender-pays does not). Mirrors UpdateOrderCommandHandler so an admin correcting
        // the fee from the Finance page after delivery keeps the courier's cash consistent.
        var isDelivered = order.Status is OrderStatus.DeliveredToRecipient
                                       or OrderStatus.ExchangeCompleted
                                       or OrderStatus.DeliveredReturnOrderToWarehouse
                                       or OrderStatus.ReturnedToSender;
        if (isDelivered)
            order.AmountOfCashCollected = order.WhoPaysForCompanyService == ServicePayer.Recipient
                ? (order.AmountToCollectForPackage ?? 0m) + order.CompanyServicePrice
                : order.AmountToCollectForPackage;

        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── SetDistrictCompanyServicePrice ────────────────────────────────────────────
public sealed class SetDistrictCompanyServicePriceCommandHandler : IRequestHandler<SetDistrictCompanyServicePriceCommand>
{
    private readonly IAppDbContext _context;
    public SetDistrictCompanyServicePriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetDistrictCompanyServicePriceCommand request, CancellationToken cancellationToken)
    {
        if (request.Price.HasValue && request.Price.Value < 0)
            throw new ValidationException(new[] {
                new FluentValidation.Results.ValidationFailure("Price", "Company service price must be a non-negative value.")
            });

        var district = await _context.Districts
            .FirstOrDefaultAsync(d => d.Id == request.DistrictId, cancellationToken)
            ?? throw new NotFoundException("District", request.DistrictId);

        district.CompanyServicePrice = request.Price;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── AdminMarkOrderDelivered ───────────────────────────────────────────────────
public sealed class AdminMarkOrderDeliveredCommandHandler : IRequestHandler<AdminMarkOrderDeliveredCommand>
{
    private readonly IAppDbContext _context;
    public AdminMarkOrderDeliveredCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AdminMarkOrderDeliveredCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.OrderType == OrderType.Return)
            throw new ConflictException("Return orders are delivered to the warehouse, not the recipient.");

        var terminalStatuses = new[]
        {
            OrderStatus.DeliveredToRecipient,
            OrderStatus.ExchangeCompleted,
            OrderStatus.CancelledByAdmin,
            OrderStatus.CancelledBySender,
            OrderStatus.OrderNotAccepted,
        };
        if (terminalStatuses.Contains(order.Status))
            throw new ConflictException($"Order is already in a terminal status: {order.Status}.");

        // Attribute the delivery to a courier when none is assigned yet, so the order
        // is picked up live by that courier's daily settlement. Never overrides an
        // existing assignee.
        Guid? courierIdForSalary = order.CourierId;
        if (order.CourierId is null && request.CourierId is Guid courierId)
        {
            var courierExists = await _context.Couriers
                .AnyAsync(c => c.Id == courierId, cancellationToken);
            if (!courierExists)
                throw new NotFoundException("Courier", courierId);

            order.CourierId = courierId;
            courierIdForSalary = courierId;
        }

        // Set/refresh the courier salary atomically with the delivery and recompute
        // CompanyRevenue, mirroring SetCourierSalaryCommand, so the settlement is complete.
        // An explicit admin value always wins; otherwise fall back to the courier's standard
        // rate (Tbilisi only — see Courier.DefaultSalary) when the order has none yet, mirroring
        // AssignCourierToOrderCommandHandler.
        if (request.Salary is decimal salary)
        {
            if (salary < 0)
                throw new ValidationException(new[] {
                    new FluentValidation.Results.ValidationFailure("Salary", "Courier salary must be a non-negative value.")
                });

            order.CourierSalary  = salary;
            order.CompanyRevenue = order.CompanyServicePrice - salary;
        }
        else if (order.CourierSalary is null && courierIdForSalary is Guid cid)
        {
            var defaultSalary = await _context.Couriers
                .Where(c => c.Id == cid)
                .Select(c => c.DefaultSalary)
                .FirstOrDefaultAsync(cancellationToken);

            if (defaultSalary is decimal ds)
            {
                order.CourierSalary  = ds;
                order.CompanyRevenue = order.CompanyServicePrice - ds;
            }
        }

        var wasNotPaid = order.ProductPaymentStatus == PaymentStatus.NotPaid;

        order.Status               = OrderStatus.DeliveredToRecipient;
        order.ProductPaymentStatus = PaymentStatus.Paid;

        if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
        {
            if (wasNotPaid && order.AmountToCollectForPackage.HasValue)
                order.AmountOfCashCollected = order.AmountToCollectForPackage.Value + order.CompanyServicePrice;
            else if (!wasNotPaid)
                order.AmountOfCashCollected = order.CompanyServicePrice;

            order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        }
        else if (order.WhoPaysForCompanyService == ServicePayer.Sender
              && order.AmountToCollectForPackage.HasValue
              && order.AmountToCollectForPackage.Value > 0)
        {
            order.AmountOfCashCollected = order.AmountToCollectForPackage.Value;
        }

        order.DeliveredAt    = CustomTime.Now;
        order.PostponeReason = null;
        order.PostponeComment = null;
        await _context.SaveChangesAsync(cancellationToken);


        if (order.GroupOrderId.HasValue)
            await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId.Value, cancellationToken);
    }
}

// ── AdminMarkReturnDeliveredToWarehouse ───────────────────────────────────────
public sealed class AdminMarkReturnDeliveredToWarehouseCommandHandler
    : IRequestHandler<AdminMarkReturnDeliveredToWarehouseCommand>
{
    private readonly IAppDbContext _context;
    public AdminMarkReturnDeliveredToWarehouseCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AdminMarkReturnDeliveredToWarehouseCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("This action is only valid for Return orders.");

        var terminalStatuses = new[]
        {
            OrderStatus.DeliveredReturnOrderToWarehouse,
            OrderStatus.ReturnedToSender,
            OrderStatus.CancelledByAdmin,
            OrderStatus.CancelledBySender,
        };
        if (terminalStatuses.Contains(order.Status))
            throw new ConflictException($"Order is already in a terminal status: {order.Status}.");

        order.Status                 = OrderStatus.DeliveredReturnOrderToWarehouse;
        order.DeliveredToWarehouseAt = CustomTime.Now;

        // Recipient-paid return: the courier collected the company service fee in cash.
        // Mirror MarkReturnDeliveredToWarehouse so the cash position reconciles.
        if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
        {
            order.AmountOfCashCollected       = (order.AmountToCollectForPackage ?? 0m) + order.CompanyServicePrice;
            order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        }

        await _context.SaveChangesAsync(cancellationToken);

    }
}

// ── SetDistrictTerritory ──────────────────────────────────────────────────────
public sealed class SetDistrictTerritoryCommandHandler : IRequestHandler<SetDistrictTerritoryCommand>
{
    private readonly IAppDbContext _context;
    public SetDistrictTerritoryCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetDistrictTerritoryCommand request, CancellationToken cancellationToken)
    {
        if (request.IsCapitalTerritory && request.IsCityTerritory)
            throw new ValidationException(new[] {
                new FluentValidation.Results.ValidationFailure(
                    "IsCityTerritory",
                    "A district cannot be both Capital Territory and City Territory at the same time.")
            });

        var district = await _context.Districts
            .FirstOrDefaultAsync(d => d.Id == request.DistrictId, cancellationToken)
            ?? throw new NotFoundException("District", request.DistrictId);

        district.IsCapitalTerritory = request.IsCapitalTerritory;
        district.IsCityTerritory = request.IsCityTerritory;
        await _context.SaveChangesAsync(cancellationToken);
    }
}