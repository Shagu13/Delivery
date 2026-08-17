using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SecondaryAddresses.Commands;

/// <summary>Removes one of a customer's saved pickup addresses.</summary>
public sealed record DeleteCustomerSecondaryAddressCommand(Guid CustomerId, Guid AddressId) : IRequest;

public sealed class DeleteCustomerSecondaryAddressCommandHandler : IRequestHandler<DeleteCustomerSecondaryAddressCommand>
{
    private readonly IAppDbContext _context;
    public DeleteCustomerSecondaryAddressCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(DeleteCustomerSecondaryAddressCommand request, CancellationToken cancellationToken)
    {
        var row = await _context.CustomerSecondaryAddresses
            .FirstOrDefaultAsync(a => a.Id == request.AddressId && a.CustomerId == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.CustomerSecondaryAddress), request.AddressId);

        _context.CustomerSecondaryAddresses.Remove(row);
        await _context.SaveChangesAsync(cancellationToken);
    }
}
