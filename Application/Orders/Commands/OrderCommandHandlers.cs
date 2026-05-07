using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    public AssignCourierToOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AssignCourierToOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
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

// ── MarkOrderReceived ─────────────────────────────────────────────────────────
public sealed class MarkOrderReceivedCommandHandler : IRequestHandler<MarkOrderReceivedCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderReceivedCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderReceivedCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status != OrderStatus.CourierAssignedToDeliver)
            throw new ConflictException($"Expected CourierAssignedToDeliver. Current: {order.Status}.");

        var receivedAt = DateTime.UtcNow;

        order.Status                 = OrderStatus.CourierRecievedOrderToDeliver;
        order.PickedUpFromWarehouseAt = receivedAt;

        // Auto-fill delivery window for non-Tbilisi orders
        const string tbilisi = "Tbilisi";   
        if (!order.RecipientCity.Equals(tbilisi, StringComparison.OrdinalIgnoreCase))
        {
            order.DeliveryDateFrom = receivedAt.Date.AddDays(1);
            order.DeliveryDateTo   = receivedAt.Date.AddDays(4);
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── MarkOrderDelivered ────────────────────────────────────────────────────────
// NOTE: The intermediate "OrderIsBeingDeliveredToRecipient" step has been removed.
// Courier goes directly from CourierRecievedOrderToDeliver → DeliveredToRecipient.
public sealed class MarkOrderDeliveredCommandHandler : IRequestHandler<MarkOrderDeliveredCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderDeliveredCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderDeliveredCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status != OrderStatus.CourierRecievedOrderToDeliver)
            throw new ConflictException($"Expected CourierRecievedOrderToDeliver. Current: {order.Status}.");

        order.Status      = OrderStatus.DeliveredToRecipient;
        order.DeliveredAt = DateTime.UtcNow;
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
