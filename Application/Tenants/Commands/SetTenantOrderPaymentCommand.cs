using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.Commands;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Commands;

/// <summary>
/// A tenant co-admin records (or clears) a settlement payment on one of their OWN
/// sub-customers' orders — COD they paid out to the customer, or service they collected.
/// Guards ownership (the order's owning customer must belong to <see cref="TenantId"/>)
/// then reuses the shared per-order payment command. TenantId from the JWT claim only.
/// </summary>
public sealed record SetTenantOrderPaymentCommand(
    Guid     TenantId,
    Guid     OrderId,
    decimal? CodPaidAmount,
    bool?    CodPaid,
    decimal? ServicePaidAmount,
    bool?    ServicePaid
) : IRequest<Guid>;

public sealed class SetTenantOrderPaymentCommandHandler
    : IRequestHandler<SetTenantOrderPaymentCommand, Guid>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public SetTenantOrderPaymentCommandHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task<Guid> Handle(SetTenantOrderPaymentCommand request, CancellationToken cancellationToken)
    {
        bool owned = await _context.Orders.AnyAsync(
            o => o.Id == request.OrderId
              && ((o.GroupOrder != null && o.GroupOrder.Customer != null && o.GroupOrder.Customer.TenantId == request.TenantId)
                  || (o.Customer != null && o.Customer.TenantId == request.TenantId)),
            cancellationToken);
        if (!owned)
            throw new NotFoundException("Order", request.OrderId);

        return await _sender.Send(new SetOrderSettlementPaymentCommand(
            request.OrderId,
            request.CodPaidAmount, request.CodPaid,
            request.ServicePaidAmount, request.ServicePaid), cancellationToken);
    }
}
