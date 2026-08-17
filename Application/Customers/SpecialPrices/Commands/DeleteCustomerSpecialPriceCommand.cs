using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SpecialPrices.Commands;

/// <summary>Removes one of a customer's district price exceptions — the district reverts
/// to their normal capital/city/district tier (or the district default).</summary>
public sealed record DeleteCustomerSpecialPriceCommand(Guid CustomerId, Guid Id) : IRequest;

public sealed class DeleteCustomerSpecialPriceCommandHandler : IRequestHandler<DeleteCustomerSpecialPriceCommand>
{
    private readonly IAppDbContext _context;
    public DeleteCustomerSpecialPriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteCustomerSpecialPriceCommand request, CancellationToken cancellationToken)
    {
        var row = await _context.CustomerSpecialPrices
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.CustomerId == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.CustomerSpecialPrice), request.Id);

        _context.CustomerSpecialPrices.Remove(row);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
