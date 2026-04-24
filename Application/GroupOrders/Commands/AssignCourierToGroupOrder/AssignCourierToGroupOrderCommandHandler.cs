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

    public AssignCourierToGroupOrderCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(AssignCourierToGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (groupOrder.Status != OrderStatus.AcceptedGroupOrder)
            throw new ConflictException($"A courier can only be assigned to an AcceptedGroupOrder. Current status: {groupOrder.Status}.");

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
    }
}
