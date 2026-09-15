using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.Shared;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AssignCourierToGroupOrder;

public sealed class BulkAssignCourierToGroupOrdersCommandHandler
    : IRequestHandler<BulkAssignCourierToGroupOrdersCommand, BulkAssignCourierToGroupOrdersResultDto>
{
    // Same window as the single-item AssignCourierToGroupOrderCommandHandler: the initial
    // assignment (AcceptedGroupOrder) and re-assignment while pickup is still pending
    // (CourierAssignedToPickUp) — not once the batch has actually been collected.
    private static readonly OrderStatus[] ValidStatuses =
    {
        OrderStatus.AcceptedGroupOrder,
        OrderStatus.CourierAssignedToPickUp,
    };

    private readonly IAppDbContext _context;
    private readonly IOrderAssignmentNotifier _assignmentNotifier;

    public BulkAssignCourierToGroupOrdersCommandHandler(
        IAppDbContext context, IOrderAssignmentNotifier assignmentNotifier)
    {
        _context = context;
        _assignmentNotifier = assignmentNotifier;
    }

    public async Task<BulkAssignCourierToGroupOrdersResultDto> Handle(
        BulkAssignCourierToGroupOrdersCommand request, CancellationToken cancellationToken)
    {
        var courier = await _context.Couriers
            .FirstOrDefaultAsync(c => c.Id == request.CourierId, cancellationToken)
            ?? throw new NotFoundException("Courier", request.CourierId);

        var requestedIds = request.GroupOrderIds.Distinct().ToList();

        var groupOrders = await _context.GroupOrders
            .Include(go => go.Orders)
            .Where(go => requestedIds.Contains(go.Id))
            .ToListAsync(cancellationToken);

        var succeeded = new List<Guid>();
        var failed = new List<BulkAssignCourierToGroupOrdersFailureDto>();
        var toNotify = new List<(Guid CourierId, string? Business, string City, string District)>();

        var foundIds = groupOrders.Select(go => go.Id).ToHashSet();
        foreach (var missingId in requestedIds.Where(id => !foundIds.Contains(id)))
            failed.Add(new BulkAssignCourierToGroupOrdersFailureDto(missingId, "Group order not found."));

        foreach (var groupOrder in groupOrders)
        {
            if (!ValidStatuses.Contains(groupOrder.Status))
            {
                failed.Add(new BulkAssignCourierToGroupOrdersFailureDto(
                    groupOrder.Id, $"Cannot assign courier from status {groupOrder.Status}."));
                continue;
            }

            groupOrder.CourierId = courier.Id;
            groupOrder.Status    = OrderStatus.CourierAssignedToPickUp;
            // Skip a package the customer/admin already cancelled out of this batch —
            // assigning a pickup courier must not resurrect it.
            foreach (var order in groupOrder.Orders)
                if (!PickupFlowOrderMirror.TerminalBeforeWarehouse.Contains(order.Status))
                    order.Status = OrderStatus.CourierAssignedToPickUp;

            succeeded.Add(groupOrder.Id);
            toNotify.Add((courier.Id, groupOrder.SenderBusinessName, groupOrder.PickUpCity, groupOrder.PickUpDistrict));
        }

        if (succeeded.Count > 0)
            await _context.SaveChangesAsync(cancellationToken);

        // Realtime admin/courier dashboard pings fire once for the whole batch via
        // RealtimeDashboardInterceptor (reacts to the CourierId/Status changes above).
        foreach (var n in toNotify)
            _assignmentNotifier.NotifyCourierAssignedPickup(n.CourierId, n.Business, n.City, n.District);

        return new BulkAssignCourierToGroupOrdersResultDto(succeeded, failed);
    }
}
