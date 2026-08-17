using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SecondaryAddresses.Commands;

/// <summary>Adds one of a customer's saved pickup addresses. Capped at 5 per customer.</summary>
public sealed record AddCustomerSecondaryAddressCommand(
    Guid   CustomerId,
    string Label,
    string City,
    string District,
    string Address
) : IRequest<Guid>;

public sealed class AddCustomerSecondaryAddressCommandValidator : AbstractValidator<AddCustomerSecondaryAddressCommand>
{
    public AddCustomerSecondaryAddressCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.Label).NotEmpty().MaximumLength(60);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.District).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(250);
    }
}

public sealed class AddCustomerSecondaryAddressCommandHandler : IRequestHandler<AddCustomerSecondaryAddressCommand, Guid>
{
    public const int MaxAddressesPerCustomer = 5;

    private readonly IAppDbContext _context;
    public AddCustomerSecondaryAddressCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(AddCustomerSecondaryAddressCommand request, CancellationToken cancellationToken)
    {
        var existingCount = await _context.CustomerSecondaryAddresses
            .CountAsync(a => a.CustomerId == request.CustomerId, cancellationToken);
        if (existingCount >= MaxAddressesPerCustomer)
            throw new ConflictException($"You can save up to {MaxAddressesPerCustomer} addresses.");

        var address = new CustomerSecondaryAddress
        {
            CustomerId = request.CustomerId,
            Label      = request.Label.Trim(),
            City       = request.City,
            District   = request.District,
            Address    = request.Address.Trim(),
        };
        _context.CustomerSecondaryAddresses.Add(address);
        await _context.SaveChangesAsync(cancellationToken);

        return address.Id;
    }
}
