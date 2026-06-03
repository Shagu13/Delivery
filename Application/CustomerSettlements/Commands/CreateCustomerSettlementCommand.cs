using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>
/// Creates the monthly settlement row for a customer + (year, month).
/// The four aggregate figures are computed from the customer's orders; payment
/// totals start at zero. Fails if a settlement for that customer+month exists.
/// </summary>
public sealed record CreateCustomerSettlementCommand(
    Guid CustomerId,
    int  Year,
    int  Month
) : IRequest<Guid>;

public sealed class CreateCustomerSettlementCommandHandler
    : IRequestHandler<CreateCustomerSettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public CreateCustomerSettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        CreateCustomerSettlementCommand request,
        CancellationToken cancellationToken)
    {
        var customerExists = await _context.Customers
            .AnyAsync(c => c.Id == request.CustomerId, cancellationToken);
        if (!customerExists)
            throw new NotFoundException("Customer", request.CustomerId);

        var alreadyExists = await _context.CustomerSettlements
            .AnyAsync(s => s.CustomerId == request.CustomerId
                        && s.Year == request.Year
                        && s.Month == request.Month,
                      cancellationToken);
        if (alreadyExists)
            throw new ConflictException(
                $"A settlement for customer {request.CustomerId} for {request.Year}-{request.Month:D2} already exists.");

        var figures = await CustomerSettlementService.ComputeAsync(
            _context, request.CustomerId, request.Year, request.Month, cancellationToken);

        var settlement = new CustomerSettlement
        {
            CustomerId                            = request.CustomerId,
            Year                                  = request.Year,
            Month                                 = request.Month,
            TotalNumberOfOrdersPlaced             = figures.OrdersPlaced,
            TotalNumberOfOrderDelivered           = figures.OrdersDelivered,
            TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages,
            TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed,
            CreatedAt                             = DateTime.UtcNow,
        };

        _context.CustomerSettlements.Add(settlement);
        await _context.SaveChangesAsync(cancellationToken);

        return settlement.Id;
    }
}
