using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.GroupAndAcceptStandaloneOrder;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

using Domain;
namespace Application.GroupOrders.Commands.AcceptGroupOrder;

public sealed class AcceptGroupOrderCommandHandler : IRequestHandler<AcceptGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public AcceptGroupOrderCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task Handle(AcceptGroupOrderCommand request, CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .Include(go => go.Orders)
            .FirstOrDefaultAsync(go => go.Id == request.GroupOrderId, cancellationToken);

        // The id may belong to a standalone order shown as a synthetic single-order
        // card (its id is the order's id, not a real batch). Group it into a batch and
        // accept that, instead of failing — keeps standalone Accept working even if a
        // client calls the plain accept route.
        if (groupOrder is null)
        {
            var standalone = await _context.Orders
                .AsNoTracking()
                .FirstOrDefaultAsync(o => o.Id == request.GroupOrderId && o.GroupOrderId == null, cancellationToken);

            if (standalone is not null)
            {
                await _sender.Send(new GroupAndAcceptStandaloneOrderCommand(standalone.Id), cancellationToken);
                return;
            }

            throw new NotFoundException("GroupOrder", request.GroupOrderId);
        }

        if (groupOrder.Status != OrderStatus.Pending)
            throw new ConflictException($"Only Pending group orders can be accepted. Current status: {groupOrder.Status}.");

        groupOrder.Status     = OrderStatus.AcceptedGroupOrder;
        groupOrder.AcceptedAt = CustomTime.Now;

        // Skip packages the customer already cancelled while the batch sat Pending —
        // accepting the batch must not resurrect them (see AcceptGroupOrderInWarehouse's
        // same guard).
        foreach (var order in groupOrder.Orders)
        {
            if (IsTerminal(order.Status))
                continue;

            order.Status = OrderStatus.AcceptedOrder;
        }

        await _context.SaveChangesAsync(cancellationToken);
    }

    private static bool IsTerminal(OrderStatus status) =>
        status is OrderStatus.CancelledBySender
               or OrderStatus.CancelledByAdmin
               or OrderStatus.OrderNotAccepted;
}
