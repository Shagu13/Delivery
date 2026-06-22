using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.AcceptGroupOrder;
using Application.GroupOrders.Commands.AttachOrdersToGroupOrder;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.GroupAndAcceptStandaloneOrder;

/// <summary>
/// Admin action for a standalone order (GroupOrderId == null): group it into a batch — the
/// chosen existing batch (<see cref="TargetGroupOrderId"/>) or, when none is chosen, a new
/// batch — and then accept it. A standalone order cannot be accepted directly because the
/// whole pickup flow is batch-based; this folds the "group/merge, then accept" steps into one.
/// Returns the resulting batch id.
/// </summary>
public sealed record GroupAndAcceptStandaloneOrderCommand(
    Guid  OrderId,
    Guid? TargetGroupOrderId = null
) : IRequest<Guid>;

public sealed class GroupAndAcceptStandaloneOrderCommandHandler
    : IRequestHandler<GroupAndAcceptStandaloneOrderCommand, Guid>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public GroupAndAcceptStandaloneOrderCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task<Guid> Handle(
        GroupAndAcceptStandaloneOrderCommand request, CancellationToken cancellationToken)
    {
        var order = await _context.Orders
            .FirstOrDefaultAsync(o => o.Id == request.OrderId, cancellationToken)
            ?? throw new NotFoundException("Order", request.OrderId);

        if (order.GroupOrderId != null)
            throw new ConflictException("This order is already part of a batch.");
        if (order.CustomerId is not Guid customerId)
            throw new ConflictException("This standalone order has no owning customer to group it under.");

        // 1) Group: into the chosen existing batch, or a new batch when none was picked.
        var grouped = await _sender.Send(
            new AttachOrdersToGroupOrderCommand(
                customerId,
                order.CreatedAt.Date,
                new List<Guid> { order.Id },
                request.TargetGroupOrderId,
                ForceNewBatch: request.TargetGroupOrderId is null),
            cancellationToken);
        var groupOrderId = grouped.GroupOrderId;

        // 2) Accept the batch if it is still Pending; if it was merged into an already-
        //    accepted batch, just bring the freshly-added order up to AcceptedOrder.
        var batch = await _context.GroupOrders
            .Include(g => g.Orders)
            .FirstAsync(g => g.Id == groupOrderId, cancellationToken);

        if (batch.Status == OrderStatus.Pending)
        {
            await _sender.Send(new AcceptGroupOrderCommand(groupOrderId), cancellationToken);
        }
        else
        {
            var moved = batch.Orders.FirstOrDefault(o => o.Id == request.OrderId);
            if (moved is not null && moved.Status == OrderStatus.Pending)
            {
                moved.Status = OrderStatus.AcceptedOrder;
                await _context.SaveChangesAsync(cancellationToken);
            }
        }

        return groupOrderId;
    }
}
