using Application.Common.Exceptions;
using Application.Common.Interfaces;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SecondaryAddresses.Commands;

/// <summary>Edits one of a customer's saved pickup addresses.</summary>
public sealed record UpdateCustomerSecondaryAddressCommand(
    Guid   CustomerId,
    Guid   AddressId,
    string Label,
    string City,
    string District,
    string Address
) : IRequest;

public sealed class UpdateCustomerSecondaryAddressCommandValidator : AbstractValidator<UpdateCustomerSecondaryAddressCommand>
{
    public UpdateCustomerSecondaryAddressCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.AddressId).NotEmpty();
        RuleFor(x => x.Label).NotEmpty().MaximumLength(60);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.District).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(250);
    }
}

public sealed class UpdateCustomerSecondaryAddressCommandHandler : IRequestHandler<UpdateCustomerSecondaryAddressCommand>
{
    private readonly IAppDbContext _context;
    public UpdateCustomerSecondaryAddressCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateCustomerSecondaryAddressCommand request, CancellationToken cancellationToken)
    {
        var row = await _context.CustomerSecondaryAddresses
            .FirstOrDefaultAsync(a => a.Id == request.AddressId && a.CustomerId == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException(nameof(Domain.CustomerSecondaryAddress), request.AddressId);

        row.Label    = request.Label.Trim();
        row.City     = request.City;
        row.District = request.District;
        row.Address  = request.Address.Trim();

        await _context.SaveChangesAsync(cancellationToken);
    }
}
