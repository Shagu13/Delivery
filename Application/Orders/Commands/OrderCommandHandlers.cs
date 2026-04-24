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

        const string tbilisi = "თბილისი";
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

        // Valid from either Tbilisi (AdminAcceptedOrderInWareHouse) or after city transit
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

        // Order.CourierId = last-mile delivery courier (distinct from GroupOrder.CourierId = pickup courier)
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

        order.Status                  = OrderStatus.CourierRecievedOrderToDeliver;
        order.PickedUpFromWarehouseAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── MarkOrderDelivering ───────────────────────────────────────────────────────
public sealed class MarkOrderDeliveringCommandHandler : IRequestHandler<MarkOrderDeliveringCommand>
{
    private readonly IAppDbContext _context;
    public MarkOrderDeliveringCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkOrderDeliveringCommand request, CancellationToken cancellationToken)
    {
        var (order, _) = await OrderCourierGuard.LoadAndVerifyAsync(
            _context, request.OrderId, request.CourierUserId, cancellationToken);

        if (order.Status != OrderStatus.CourierRecievedOrderToDeliver)
            throw new ConflictException($"Expected CourierRecievedOrderToDeliver. Current: {order.Status}.");

        order.Status = OrderStatus.OrderIsBeingDeliveredToRecipient;

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

        if (order.Status != OrderStatus.OrderIsBeingDeliveredToRecipient)
            throw new ConflictException($"Expected OrderIsBeingDeliveredToRecipient. Current: {order.Status}.");

        order.Status      = OrderStatus.DeliveredToRecipient;
        order.DeliveredAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
