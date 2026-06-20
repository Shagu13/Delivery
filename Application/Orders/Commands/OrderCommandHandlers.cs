using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

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
    private readonly IRecipientNotificationSmsService _recipientSms;
    private readonly IRealtimeNotifier _notifier;
    private readonly ILogger<AssignCourierToOrderCommandHandler> _logger;

    public AssignCourierToOrderCommandHandler(
        IAppDbContext context,
        IRecipientNotificationSmsService recipientSms,
        IRealtimeNotifier notifier,
        ILogger<AssignCourierToOrderCommandHandler> logger)
    {
        _context = context;
        _recipientSms = recipientSms;
        _notifier = notifier;
        _logger = logger;
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
        };

        if (!validStatuses.Contains(order.Status))
            throw new ConflictException(
                $"Cannot assign courier from status {order.Status}. " +
                "Expected AdminAcceptedOrderInWareHouse, OrderIsOnItsWayToRecipientsCity, " +
                "or CourierAssignedToDeliver (re-assignment).");

        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        // Capture the prior assignee so a re-assignment can drop the order from
        // their active deliveries live.
        var previousCourierId = order.CourierId;

        order.CourierId = courier.Id;
        order.AssignedToCourierAt = CustomTime.Now;
        order.Status = OrderStatus.CourierAssignedToDeliver;
        await _context.SaveChangesAsync(cancellationToken);

        // Live-refresh dashboards: the newly assigned courier (order appears),
        // the previous courier on a re-assignment (order leaves), and admins.
        _notifier.NotifyCourierOrdersChanged(courier.Id);
        if (previousCourierId is Guid prev && prev != courier.Id)
            _notifier.NotifyCourierOrdersChanged(prev);
        _notifier.NotifyAdminsOrdersChanged();

        // ── Notify recipient via SMS ──────────────────────────────────────────
        // Fire-and-forget inside a try/catch so SMS failure never rolls back the assignment.
        try
        {
            await _recipientSms.SendCourierAssignedNotificationAsync(
                order.RecipientPhone,
                order.TrackingNumber,
                order.GroupOrder?.SenderBusinessName ?? string.Empty,
                cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Failed to send recipient SMS notification for order {OrderId} (tracking: {TrackingNumber})",
                order.Id, order.TrackingNumber);
        }
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

// ── MarkOrderDelivering ───────────────────────────────────────────────────────
// Courier picks up the order from warehouse and starts delivering.
public sealed class MarkOrderDeliveringCommandHandler : IRequestHandler<MarkOrderDeliveringCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderDeliveringCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderDeliveringCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status != OrderStatus.CourierAssignedToDeliver)
            throw new ConflictException($"Expected CourierAssignedToDeliver. Current: {order.Status}.");

        var pickedUpAt = CustomTime.Now;

        order.Status = OrderStatus.CourierDeliveringTheOrderToRecipient;
        order.PickedUpFromWarehouseAt = pickedUpAt;

        // Auto-fill delivery window for non-Tbilisi orders
        const string tbilisi = "Tbilisi";
        if (!order.RecipientCity.Equals(tbilisi, StringComparison.OrdinalIgnoreCase))
        {
            order.DeliveryDateFrom = pickedUpAt.Date.AddDays(1);
            order.DeliveryDateTo = pickedUpAt.Date.AddDays(4);
        }

        await _context.SaveChangesAsync(cancellationToken);
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

        if (order.Status != OrderStatus.CourierDeliveringTheOrderToRecipient)
            throw new ConflictException($"Expected CourierDeliveringTheOrderToRecipient. Current: {order.Status}.");

        // Capture payment status before marking paid, so the cash-collection logic below
        // still knows whether the product was unpaid at the time of delivery.
        var wasNotPaid = order.ProductPaymentStatus == PaymentStatus.NotPaid;

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
        await _context.SaveChangesAsync(cancellationToken);

        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        if (order.Status != OrderStatus.CourierDeliveringTheOrderToRecipient)
            throw new ConflictException($"Expected CourierDeliveringTheOrderToRecipient. Current: {order.Status}.");

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
        await _context.SaveChangesAsync(cancellationToken);

        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        if (order.Status != OrderStatus.CourierDeliveringTheOrderToRecipient)
            throw new ConflictException($"Expected CourierDeliveringTheOrderToRecipient. Current: {order.Status}.");

        order.Status = OrderStatus.DeliveryPostponed;
        order.PostponeReason = request.Reason;
        order.PostponedAt = CustomTime.Now;
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

        order.Status = OrderStatus.CourierDeliveringTheOrderToRecipient;
        order.PostponeReason = null;
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

        if (order.Status is not (OrderStatus.CourierDeliveringTheOrderToRecipient or OrderStatus.DeliveryPostponed))
            throw new ConflictException($"Cannot cancel from status {order.Status}.");

        order.Status              = OrderStatus.OrderNotAccepted;
        order.CancellationReason  = request.Reason;
        order.CancellationComment = request.Reason == CancellationReason.Other
            ? (string.IsNullOrWhiteSpace(request.Comment) ? null : request.Comment.Trim())
            : null;
        order.CancelledAt         = CustomTime.Now;
        // Clear any postpone state — this is now terminal.
        order.PostponeReason      = null;
        order.PostponedAt         = null;

        await _context.SaveChangesAsync(cancellationToken);

        // A cancelled (not-accepted) order drops out of its batch invoice.
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        order.Status = OrderStatus.CancelledByAdmin;
        await _context.SaveChangesAsync(cancellationToken);

        // Drop the cancelled order from its batch invoice (or soft-delete a standalone
        // Return invoice).
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        // Drop the cancelled order from its batch invoice.
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        if (groupOrder is null || groupOrder.Status == OrderStatus.AllDelivered) return;

        groupOrder.Status = OrderStatus.AllDelivered;
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

        order.CompanyServicePrice = request.Price;

        // Recalculate revenue if courier salary already set
        if (order.CourierSalary.HasValue)
            order.CompanyRevenue = order.CompanyServicePrice - order.CourierSalary.Value;

        await _context.SaveChangesAsync(cancellationToken);

        // Service price feeds "service owed by customer" on the batch invoice.
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);
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
        await _context.SaveChangesAsync(cancellationToken);

        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);

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

        // Refresh the standalone Return invoice (delivered count).
        await CustomerSettlements.CustomerSettlementService.UpsertForOrderAsync(_context, order, cancellationToken);
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