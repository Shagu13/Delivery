using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
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
        order.AssignedToCourierAt = CustomTime.Now;

        // Only advance a fresh (Pending) return into the assigned state. A return that is
        // already further along (picked up, at warehouse) keeps its status so an admin can
        // (re)attach or change the courier without rewinding the flow.
        if (order.Status == OrderStatus.Pending)
            order.Status = OrderStatus.CourierAssignedToPickUp;

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
        order.PickedUpFromRecipientAt = CustomTime.Now;

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

        order.Status                 = OrderStatus.DeliveredReturnOrderToWarehouse;
        order.DeliveredToWarehouseAt = CustomTime.Now;

        // Recipient-paid return: the courier collected the company service fee in cash
        // from the recipient. Record it so it flows into the courier's cash settlement
        // and the company cash position. (Returns carry no product COD, but the
        // AmountToCollectForPackage fallback keeps the formula identical to deliveries.)
        if (order.WhoPaysForCompanyService == ServicePayer.Recipient)
        {
            order.AmountOfCashCollected       = (order.AmountToCollectForPackage ?? 0m) + order.CompanyServicePrice;
            order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
        }

        await _context.SaveChangesAsync(ct);
    }
}

// ── AdminSetReturnOrderStatus ─────────────────────────────────────────────────
// Free admin override of a Return order's status. The per-step courier/admin actions
// (assign → picked-up → warehouse → returned) only move the order forward one hop at a
// time and leave gaps (e.g. no admin action for PickedUpFromRecipient); this lets an
// admin set any status directly to correct a stuck or mis-recorded return.
public sealed class AdminSetReturnOrderStatusCommandHandler
    : IRequestHandler<AdminSetReturnOrderStatusCommand>
{
    private readonly IAppDbContext _context;
    public AdminSetReturnOrderStatusCommandHandler(IAppDbContext context) => _context = context;

    // The full set of statuses a standalone Return moves through, plus admin cancel.
    private static readonly HashSet<OrderStatus> AllowedReturnStatuses = new()
    {
        OrderStatus.Pending,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.PickedUpFromRecipient,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
        OrderStatus.CancelledByAdmin,
    };

    public async Task Handle(AdminSetReturnOrderStatusCommand request, CancellationToken ct)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, ct)
            ?? throw new NotFoundException(nameof(Domain.Order), request.OrderId);

        if (order.OrderType != OrderType.Return)
            throw new ConflictException("Only Return orders can have their status set via this action.");

        if (!AllowedReturnStatuses.Contains(request.NewStatus))
            throw new ConflictException($"{request.NewStatus} is not a valid Return status.");

        order.Status = request.NewStatus;

        // Stamp the milestone timestamp when advancing into it (leave any earlier stamp
        // in place so an admin nudging the status doesn't wipe real recorded times).
        switch (request.NewStatus)
        {
            case OrderStatus.CourierAssignedToPickUp:
                order.AssignedToCourierAt ??= CustomTime.Now;
                break;

            case OrderStatus.PickedUpFromRecipient:
                order.PickedUpFromRecipientAt ??= CustomTime.Now;
                break;

            case OrderStatus.DeliveredReturnOrderToWarehouse:
                order.DeliveredToWarehouseAt ??= CustomTime.Now;
                // Recipient-paid return: record the cash the courier collected once, mirroring
                // the courier's own warehouse action so it flows into settlement.
                if (order.WhoPaysForCompanyService == ServicePayer.Recipient
                    && order.CompanyServicePaymentStatus != CompanyServicePaymentStatus.Paid)
                {
                    order.AmountOfCashCollected       = (order.AmountToCollectForPackage ?? 0m) + order.CompanyServicePrice;
                    order.CompanyServicePaymentStatus = CompanyServicePaymentStatus.Paid;
                }
                break;

            case OrderStatus.ReturnedToSender:
                order.DeliveredAt ??= CustomTime.Now;
                // Logistics marker → History classifies it under "Cancelled & Returned".
                order.CancelledReturnedToSenderAt ??= CustomTime.Now;
                break;
        }

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

        switch (order.OrderType)
        {
            case OrderType.Return:
                // Standard Return terminal, set once the warehoused parcel is sent back.
                order.Status      = OrderStatus.ReturnedToSender;
                order.DeliveredAt = CustomTime.Now;
                break;

            case OrderType.Exchange:
                // An Exchange runs the Send flow to the recipient; "returned to sender" is the
                // final milestone confirming the swapped-out item got back. Only valid once the
                // exchange has actually been delivered. KEEP the original DeliveredAt so the
                // courier's settlement and the finance overview still date and count the delivery
                // (both key an Exchange off DeliveredAt, not the warehouse timestamp).
                if (order.Status is not (OrderStatus.DeliveredToRecipient or OrderStatus.ExchangeCompleted))
                    throw new ConflictException(
                        $"An Exchange can be marked ReturnedToSender only after delivery. Current: {order.Status}.");
                order.Status = OrderStatus.ReturnedToSender;
                break;

            default:
                throw new ConflictException("Only Return or Exchange orders can be marked ReturnedToSender via this endpoint.");
        }

        // Stamp the logistics marker so History classifies it under "Cancelled & Returned"
        // (parcel physically returned to the sender/store), the same bucket as a
        // cancelled-then-returned Send/Exchange order.
        order.CancelledReturnedToSenderAt ??= CustomTime.Now;

        await _context.SaveChangesAsync(ct);
    }
}
