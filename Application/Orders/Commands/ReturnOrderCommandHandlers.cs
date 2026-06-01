using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Orders.Commands;

// ── AssignCourierToReturnOrder ────────────────────────────────────────────────
public sealed class AssignCourierToReturnOrderCommandHandler
    : IRequestHandler<AssignCourierToReturnOrderCommand>
{
    private readonly IAppDbContext _context;
    public AssignCourierToReturnOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AssignCourierToReturnOrderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Order), request.OrderId);

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("Only Return orders can be assigned via this endpoint.");

        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, ct)
            ?? throw new NotFoundException("Courier", request.CourierId);

        order.CourierId = courier.Id;
        order.Status    = OrderStatus.CourierAssignedToPickUp;

        await _context.SaveChangesAsync(ct);
    }
}

// ── MarkReturnPickedUp ────────────────────────────────────────────────────────
public sealed class MarkReturnPickedUpCommandHandler
    : IRequestHandler<MarkReturnPickedUpCommand>
{
    private readonly IAppDbContext _context;
    public MarkReturnPickedUpCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkReturnPickedUpCommand request, CancellationToken ct)
    {
        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, ct)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Order), request.OrderId);

        if (order.CourierId != courier.Id)
            throw new ForbiddenException("This order is not assigned to you.");

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("Only Return orders use this action.");

        if (order.Status != OrderStatus.CourierAssignedToPickUp)
            throw new ConflictException($"Expected CourierAssignedToPickUp. Current: {order.Status}.");

        order.Status                  = OrderStatus.PickedUpFromRecipient;
        order.PickedUpFromRecipientAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
    }
}

// ── MarkReturnDeliveredToWarehouse ────────────────────────────────────────────
public sealed class MarkReturnDeliveredToWarehouseCommandHandler
    : IRequestHandler<MarkReturnDeliveredToWarehouseCommand>
{
    private readonly IAppDbContext _context;
    public MarkReturnDeliveredToWarehouseCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkReturnDeliveredToWarehouseCommand request, CancellationToken ct)
    {
        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CourierUserId, ct)
            ?? throw new NotFoundException("Courier", request.CourierUserId);

        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Order), request.OrderId);

        if (order.CourierId != courier.Id)
            throw new ForbiddenException("This order is not assigned to you.");

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("Only Return orders use this action.");

        if (order.Status != OrderStatus.PickedUpFromRecipient)
            throw new ConflictException($"Expected PickedUpFromRecipient. Current: {order.Status}.");

        order.Status                = OrderStatus.DeliveredReturnOrderToWarehouse;
        order.DeliveredToWarehouseAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
    }
}

// ── MarkReturnedToSender ──────────────────────────────────────────────────────
public sealed class MarkReturnedToSenderCommandHandler
    : IRequestHandler<MarkReturnedToSenderCommand>
{
    private readonly IAppDbContext _context;
    public MarkReturnedToSenderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkReturnedToSenderCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Order), request.OrderId);

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("Only Return orders can be marked ReturnedToSender via this endpoint.");

        order.Status      = OrderStatus.ReturnedToSender;
        order.DeliveredAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(ct);
    }
}
