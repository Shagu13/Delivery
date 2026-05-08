using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.SetCompanyPrice;

public sealed record SetCustomerCompanyPriceCommand(
    Guid     CustomerId,
    decimal? CapitalPrice,
    decimal? CityPrice,
    decimal? DistrictPrice
) : IRequest;

public sealed class SetCustomerCompanyPriceCommandHandler
    : IRequestHandler<SetCustomerCompanyPriceCommand>
{
    private readonly IAppDbContext _context;
    public SetCustomerCompanyPriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCustomerCompanyPriceCommand request, CancellationToken cancellationToken)
    {
        if ((request.CapitalPrice.HasValue  && request.CapitalPrice.Value  < 0) ||
            (request.CityPrice.HasValue     && request.CityPrice.Value     < 0) ||
            (request.DistrictPrice.HasValue && request.DistrictPrice.Value < 0))
        {
            throw new ValidationException(new[] {
                new FluentValidation.Results.ValidationFailure(
                    "Price", "Company prices must be non-negative values.")
            });
        }

        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        customer.CompanyServiceCapitalPrice  = request.CapitalPrice;
        customer.CompanyServiceCityPrice     = request.CityPrice;
        customer.CompanyServiceDistrictPrice = request.DistrictPrice;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
