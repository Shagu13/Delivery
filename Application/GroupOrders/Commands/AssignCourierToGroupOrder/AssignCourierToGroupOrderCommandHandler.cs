using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

public sealed class AssignCourierToGroupOrderCommandHandler
    : IRequestHandler<AssignCourierToGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly IWebPushService _push;

    public AssignCourierToGroupOrderCommandHandler(IAppDbContext context, IWebPushService push)
    {
        _context = context;
        _push = push;
    }

    public async Task Handle(AssignCourierToGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        // Allow the initial assignment (AcceptedGroupOrder) and re-assignment while the
        // pickup is still pending (CourierAssignedToPickUp) — so an admin can hand the
        // pickup to a different courier before it has been collected.
        var validStatuses = new[]
        {
            OrderStatus.AcceptedGroupOrder,
            OrderStatus.CourierAssignedToPickUp,
        };

        if (!validStatuses.Contains(groupOrder.Status))
            throw new ConflictException($"A courier can only be (re)assigned while the group order is awaiting pickup. Current status: {groupOrder.Status}.");

        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        groupOrder.CourierId = courier.Id;
        groupOrder.Status    = OrderStatus.CourierAssignedToPickUp;

        foreach (var order in groupOrder.Orders)
        {
            order.Status = OrderStatus.CourierAssignedToPickUp;
            // GroupOrder.CourierId tracks who picked up for warehouse;
            // Order.CourierId is reserved for last-mile delivery courier.
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Heads-up push so the courier notices the new pickup even with the app closed.
        var location = $"{groupOrder.PickUpCity}, {groupOrder.PickUpDistrict}";
        var body = string.IsNullOrWhiteSpace(groupOrder.SenderBusinessName)
            ? location : $"{groupOrder.SenderBusinessName} — {location}";
        await _push.NotifyNewOrderAsync(courier.Id, "ახალი ასაღები · New pickup", body, "/", cancellationToken);
    }
}
