using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Customers.Commands.SetCompanyPrice;

public sealed record SetCustomerCompanyPriceCommand(Guid CustomerId, decimal? Price) : IRequest;

public sealed class SetCustomerCompanyPriceCommandHandler
    : IRequestHandler<SetCustomerCompanyPriceCommand>
{
    private readonly IAppDbContext _context;
    public SetCustomerCompanyPriceCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(SetCustomerCompanyPriceCommand request, CancellationToken cancellationToken)
    {
        if (request.Price.HasValue && request.Price.Value < 0)
            throw new ValidationException(new[] {
            new FluentValidation.Results.ValidationFailure("Price", "Company price must be a non-negative value.")
                });

        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        customer.CompanyPriceToDeliverPackages = request.Price;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
