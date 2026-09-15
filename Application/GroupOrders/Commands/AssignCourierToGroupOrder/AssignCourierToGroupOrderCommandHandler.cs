using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.Shared;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

public sealed class AssignCourierToGroupOrderCommandHandler
    : IRequestHandler<AssignCourierToGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly IOrderAssignmentNotifier _assignmentNotifier;

    public AssignCourierToGroupOrderCommandHandler(IAppDbContext context, IOrderAssignmentNotifier assignmentNotifier)
    {
        _context = context;
        _assignmentNotifier = assignmentNotifier;
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
            // Skip a package the customer/admin already cancelled out of this batch —
            // assigning a pickup courier must not resurrect it.
            if (PickupFlowOrderMirror.TerminalBeforeWarehouse.Contains(order.Status))
                continue;

            order.Status = OrderStatus.CourierAssignedToPickUp;
            // GroupOrder.CourierId tracks who picked up for warehouse;
            // Order.CourierId is reserved for last-mile delivery courier.
        }

        await _context.SaveChangesAsync(cancellationToken);

        // Heads-up push so the courier notices the new pickup even with the app closed —
        // a real network call to the push service, run in the background (see
        // IOrderAssignmentNotifier) so a slow gateway never adds to this request's latency.
        _assignmentNotifier.NotifyCourierAssignedPickup(
            courier.Id, groupOrder.SenderBusinessName, groupOrder.PickUpCity, groupOrder.PickUpDistrict);
    }
}
