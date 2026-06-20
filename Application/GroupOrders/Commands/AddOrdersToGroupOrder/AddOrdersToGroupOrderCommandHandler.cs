using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements;
using Application.GroupOrders.Commands.Shared;
using Application.GroupOrders.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AddOrdersToGroupOrder;

public sealed class AddOrdersToGroupOrderCommandHandler
    : IRequestHandler<AddOrdersToGroupOrderCommand, CreateGroupOrderResultDto>
{
    private readonly IAppDbContext _context;
    private readonly ITrackingNumberGenerator _trackingGen;
    private readonly IRealtimeNotifier _notifier;

    public AddOrdersToGroupOrderCommandHandler(
        IAppDbContext context,
        ITrackingNumberGenerator trackingGen,
        IRealtimeNotifier notifier)
    {
        _context     = context;
        _trackingGen = trackingGen;
        _notifier    = notifier;
    }

    public async Task<CreateGroupOrderResultDto> Handle(
        AddOrdersToGroupOrderCommand request,
        CancellationToken cancellationToken)
    {
        var groupOrder = await _context.GroupOrders
            .FirstOrDefaultAsync(g => g.Id == request.GroupOrderId, cancellationToken)
            ?? throw new NotFoundException("GroupOrder", request.GroupOrderId);

        if (groupOrder.CustomerId != request.CustomerId)
            throw new ForbiddenException("You can only add packages to your own batch.");

        if (!GroupOrderAppendPolicy.Appendable.Contains(groupOrder.Status))
            throw new ConflictException(
                "This batch can no longer accept new packages — the courier has already picked it up.");

        // Price against the batch owner's negotiated tiers / all-in pricing flag.
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken);

        var built = await GroupOrderOrderBuilder.BuildAsync(
            _context, _trackingGen, customer, request.Orders, cancellationToken);

        // Returns are rejected by the validator, so every built order is a Send/Exchange
        // package that joins the batch. Add explicitly with the FK set — attaching a child
        // with a non-default client-generated Id to an already-tracked batch would make EF
        // attempt an UPDATE (0 rows) → DbUpdateConcurrencyException. Explicit Add = INSERT.
        foreach (var order in built)
        {
            order.GroupOrderId = groupOrder.Id;
            _context.Orders.Add(order);
        }

        groupOrder.NumberOfPackages += built.Count;

        await _context.SaveChangesAsync(cancellationToken);

        // Refresh the batch invoice to fold in the new packages' COD / service figures.
        await CustomerSettlementService.UpsertForGroupOrderAsync(_context, groupOrder.Id, cancellationToken);

        // Let open admin dashboards pick up the larger package count live.
        _notifier.NotifyAdminsOrdersChanged();

        return new CreateGroupOrderResultDto(
            GroupOrderId:       groupOrder.Id,
            SenderBusinessName: groupOrder.SenderBusinessName,
            Orders: built
                .Select(o => new CreatedOrderDto(o.Id, o.TrackingNumber, o.RecipientName))
                .ToList()
        );
    }
}
