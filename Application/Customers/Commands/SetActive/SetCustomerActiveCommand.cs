using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.SetActive;

/// <summary>
/// Soft-delete / restore a customer by flipping <see cref="Domain.Customer.IsActive"/>.
/// Inactive customers are blocked from logging in (see LoginCommandHandler) but all
/// their historical orders and settlements are preserved.
/// </summary>
public sealed record SetCustomerActiveCommand(
    Guid CustomerId,
    bool IsActive
) : IRequest;

public sealed class SetCustomerActiveCommandHandler
    : IRequestHandler<SetCustomerActiveCommand>
{
    private readonly IAppDbContext _context;
    public SetCustomerActiveCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCustomerActiveCommand request, CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        customer.IsActive = request.IsActive;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
