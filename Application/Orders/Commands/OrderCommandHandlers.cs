using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

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
    private readonly ILogger<AssignCourierToOrderCommandHandler> _logger;

    public AssignCourierToOrderCommandHandler(
        IAppDbContext context,
        IRecipientNotificationSmsService recipientSms,
        ILogger<AssignCourierToOrderCommandHandler> logger)
    {
        _context      = context;
        _recipientSms = recipientSms;
        _logger       = logger;
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
            OrderStatus.OrderIsOnItsWayToRecipientsCity
        };

        if (!validStatuses.Contains(order.Status))
            throw new ConflictException(
                $"Cannot assign courier from status {order.Status}. " +
                "Expected AdminAcceptedOrderInWareHouse or OrderIsOnItsWayToRecipientsCity.");

        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        order.CourierId = courier.Id;
        order.Status    = OrderStatus.CourierAssignedToDeliver;
        await _context.SaveChangesAsync(cancellationToken);

        // ── Notify recipient via SMS ──────────────────────────────────────────
        // Fire-and-forget inside a try/catch so SMS failure never rolls back the assignment.
        try
        {
            await _recipientSms.SendCourierAssignedNotificationAsync(
                order.RecipientPhone,
                order.TrackingNumber,
                order.GroupOrder.SenderBusinessName,
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

        var pickedUpAt = DateTime.UtcNow;

        order.Status                 = OrderStatus.CourierDeliveringTheOrderToRecipient;
        order.PickedUpFromWarehouseAt = pickedUpAt;

        // Auto-fill delivery window for non-Tbilisi orders
        const string tbilisi = "Tbilisi";
        if (!order.RecipientCity.Equals(tbilisi, StringComparison.OrdinalIgnoreCase))
        {
            order.DeliveryDateFrom = pickedUpAt.Date.AddDays(1);
            order.DeliveryDateTo   = pickedUpAt.Date.AddDays(4);
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

        order.Status        = OrderStatus.DeliveredToRecipient;

        // Auto-populate AmountOfCashCollected when the recipient is paying cash on delivery.
        // Case 1 — product unpaid, recipient pays fee: collect product amount + courier fee.
        // Case 2 — product pre-paid, recipient pays fee only: collect courier fee.
        if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
        {
            if (order.ProductPaymentStatus == PaymentStatus.NotPaid &&
                order.AmountToCollectForPackage.HasValue)
            {
                order.AmountOfCashCollected = order.AmountToCollectForPackage.Value
                                            + order.CompanyServicePrice;
            }
            else if (order.ProductPaymentStatus == PaymentStatus.Paid)
            {
                order.AmountOfCashCollected = order.CompanyServicePrice;
            }
        }

        order.DeliveredAt    = DateTime.UtcNow;
        order.PostponeReason = null;
        await _context.SaveChangesAsync(cancellationToken);

        // Auto-close the parent GroupOrder when all packages are done
        await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId, cancellationToken);
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

        order.Status        = OrderStatus.DeliveryPostponed;
        order.PostponeReason = request.Reason;
        order.PostponedAt   = DateTime.UtcNow;
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

        order.Status        = OrderStatus.CourierDeliveringTheOrderToRecipient;
        order.PostponeReason = null;
        order.PostponedAt   = null;
        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── CancelOrderByAdmin ────────────────────────────────────────────────────────
public sealed class CancelOrderByAdminCommandHandler : IRequestHandler<CancelOrderByAdminCommand>
{
    private readonly IAppDbContext _context;
    public CancelOrderByAdminCommandHandler(IAppDbContext context) => _context = context;

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

        order.Status = OrderStatus.CancelledByAdmin;
        await _context.SaveChangesAsync(cancellationToken);

        // Auto-close the parent GroupOrder when all packages are done
        await GroupOrderCloser.TryCloseGroupOrderAsync(_context, order.GroupOrderId, cancellationToken);
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

        order.CourierSalary  = request.Salary;
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
        district.IsCityTerritory    = request.IsCityTerritory;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
