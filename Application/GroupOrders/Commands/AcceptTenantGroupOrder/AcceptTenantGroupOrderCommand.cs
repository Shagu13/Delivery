using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.GroupOrders.Commands.AcceptGroupOrder;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.GroupOrders.Commands.AcceptTenantGroupOrder;

/// <summary>
/// A tenant co-admin (TenantAdmin) accepts one of their own sub-customers' pending batches.
/// Verifies the batch (or standalone Return) belongs to a customer of <see cref="TenantId"/>
/// before delegating to the shared accept logic — so a co-admin can never accept another
/// tenant's (or a root/dilo) order. TenantId comes from the JWT claim, never the request body.
/// </summary>
public sealed record AcceptTenantGroupOrderCommand(Guid GroupOrderId, Guid TenantId) : IRequest;

public sealed class AcceptTenantGroupOrderCommandHandler
    : IRequestHandler<AcceptTenantGroupOrderCommand>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public AcceptTenantGroupOrderCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task Handle(AcceptTenantGroupOrderCommand request, CancellationToken cancellationToken)
    {
        bool ownedBatch = await _context.GroupOrders.AnyAsync(
            g => g.Id == request.GroupOrderId
              && g.Customer != null && g.Customer.TenantId == request.TenantId,
            cancellationToken);

        // The id may instead be a standalone order shown as a synthetic single-order card.
        bool ownedStandalone = !ownedBatch && await _context.Orders.AnyAsync(
            o => o.Id == request.GroupOrderId && o.GroupOrderId == null
              && o.Customer != null && o.Customer.TenantId == request.TenantId,
            cancellationToken);

        if (!ownedBatch && !ownedStandalone)
            throw new NotFoundException("GroupOrder", request.GroupOrderId);

        // Ownership confirmed — reuse the existing accept logic (handles the standalone case too).
        await _sender.Send(new AcceptGroupOrderCommand(request.GroupOrderId), cancellationToken);
    }
}
