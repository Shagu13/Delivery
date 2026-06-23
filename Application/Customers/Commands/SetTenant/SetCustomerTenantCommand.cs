using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.SetTenant;

/// <summary>
/// Admin-only: assign a customer to a white-label tenant, or move them back to the
/// root brand (dilo) with <c>TenantId == null</c>. Kept as its own command (rather than
/// folding into UpdateCustomer) because UpdateCustomer is shared with the customer's own
/// profile-edit endpoint, which must never change tenant ownership.
/// </summary>
public sealed record SetCustomerTenantCommand(
    Guid  CustomerId,
    Guid? TenantId
) : IRequest;

public sealed class SetCustomerTenantCommandHandler
    : IRequestHandler<SetCustomerTenantCommand>
{
    private readonly IAppDbContext _context;
    public SetCustomerTenantCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCustomerTenantCommand request, CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        // Guard the FK: a non-null tenant must exist (and be active) before we point at it.
        if (request.TenantId is { } tenantId)
        {
            bool tenantOk = await _context.Tenants
                .AnyAsync(t => t.Id == tenantId && t.IsActive, cancellationToken);
            if (!tenantOk)
                throw new NotFoundException("Tenant", tenantId);
        }

        customer.TenantId = request.TenantId;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
