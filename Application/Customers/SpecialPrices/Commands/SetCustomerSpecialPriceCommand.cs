using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.SpecialPrices.Commands;

/// <summary>Upserts a customer's negotiated price for one specific district.</summary>
public sealed record SetCustomerSpecialPriceCommand(
    Guid    CustomerId,
    Guid    DistrictId,
    decimal Price
) : IRequest;

public sealed class SetCustomerSpecialPriceCommandValidator : AbstractValidator<SetCustomerSpecialPriceCommand>
{
    public SetCustomerSpecialPriceCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.DistrictId).NotEmpty();
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
    }
}

public sealed class SetCustomerSpecialPriceCommandHandler : IRequestHandler<SetCustomerSpecialPriceCommand>
{
    private readonly IAppDbContext _context;
    public SetCustomerSpecialPriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCustomerSpecialPriceCommand request, CancellationToken cancellationToken)
    {
        var customerExists = await _context.Customers
            .AnyAsync(c => c.Id == request.CustomerId, cancellationToken);
        if (!customerExists) throw new NotFoundException(nameof(Customer), request.CustomerId);

        var districtExists = await _context.Districts
            .AnyAsync(d => d.Id == request.DistrictId && d.DateDeleted == null, cancellationToken);
        if (!districtExists) throw new NotFoundException(nameof(District), request.DistrictId);

        var existing = await _context.CustomerSpecialPrices
            .FirstOrDefaultAsync(s => s.CustomerId == request.CustomerId && s.DistrictId == request.DistrictId, cancellationToken);

        if (existing is not null)
        {
            existing.Price = request.Price;
        }
        else
        {
            _context.CustomerSpecialPrices.Add(new CustomerSpecialPrice
            {
                CustomerId = request.CustomerId,
                DistrictId = request.DistrictId,
                Price      = request.Price,
            });
        }

        await _context.SaveChangesAsync(cancellationToken);
    }
}
