using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.Shared;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
namespace Application.GroupOrders.Commands.CourierGroupOrderActions;

// ── Helper ────────────────────────────────────────────────────────────────────
file static class CourierGuard
{
    /// <summary>Loads GroupOrder with Orders, verifies it belongs to this courier.</summary>
    internal static async Task<Domain.GroupOrder> LoadAndVerifyAsync(
        IAppDbContext context,
        Guid groupOrderId,
        string courierUserId,
        CancellationToken ct)
    {
        var courier = await context.Couriers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == courierUserId, ct)
            ?? throw new NotFoundException("Courier", courierUserId);

        var groupOrder = await context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == groupOrderId, ct)
            ?? throw new NotFoundException("GroupOrder", groupOrderId);

        if (groupOrder.CourierId != courier.Id)
            throw new ForbiddenException("This group order is not assigned to you.");

        return groupOrder;
    }
}

// ── Handler: MarkPickedUp ─────────────────────────────────────────────────────
public sealed class MarkPickedUpCommandHandler : IRequestHandler<MarkPickedUpCommand>
{
    private readonly IAppDbContext _context;
    public MarkPickedUpCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkPickedUpCommand request, CancellationToken cancellationToken)
    {
        var go = await CourierGuard.LoadAndVerifyAsync(
            _context, request.GroupOrderId, request.CourierUserId, cancellationToken);

        // The separate "on my way" pickup step was removed — the courier confirms pickup in one
        // swipe from CourierAssignedToPickUp.
        if (go.Status is not OrderStatus.CourierAssignedToPickUp)
            throw new ConflictException($"Expected CourierAssignedToPickUp. Current: {go.Status}.");

        go.Status      = OrderStatus.CourierDeliveringToWarehouse;
        go.PickedUpAt  = CustomTime.Now;
        // Skip a package the customer/admin already cancelled out of this batch —
        // confirming pickup must not resurrect it.
        foreach (var o in go.Orders)
            if (!PickupFlowOrderMirror.TerminalBeforeWarehouse.Contains(o.Status))
                o.Status = OrderStatus.CourierDeliveringToWarehouse;

        await _context.SaveChangesAsync(cancellationToken);
    }
}

// ── Handler: MarkDeliveredToWarehouse ─────────────────────────────────────────
public sealed class MarkDeliveredToWarehouseCommandHandler
    : IRequestHandler<MarkDeliveredToWarehouseCommand>
{
    private readonly IAppDbContext _context;
    public MarkDeliveredToWarehouseCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(MarkDeliveredToWarehouseCommand request, CancellationToken cancellationToken)
    {
        var go = await CourierGuard.LoadAndVerifyAsync(
            _context, request.GroupOrderId, request.CourierUserId, cancellationToken);

        if (go.Status != OrderStatus.CourierDeliveringToWarehouse)
            throw new ConflictException($"Expected CourierDeliveringToWarehouse. Current: {go.Status}.");

        go.Status                  = OrderStatus.DeliveredToWarehouse;
        go.DeliveredToWarehouseAt  = CustomTime.Now;
        // Skip a package the customer/admin already cancelled out of this batch —
        // marking the batch delivered to warehouse must not resurrect it.
        foreach (var o in go.Orders)
            if (!PickupFlowOrderMirror.TerminalBeforeWarehouse.Contains(o.Status))
                o.Status = OrderStatus.DeliveredToWarehouse;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
