using Application.Common.Exceptions;
using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Commands;

/// <summary>
/// Recomputes the four order-derived figures for an existing customer settlement
/// from the current set of orders. Payment totals are left untouched.
/// </summary>
public sealed record UpdateCustomerSettlementCommand(
    Guid CustomerId,
    int  Year,
    int  Month
) : IRequest<Guid>;

public sealed class UpdateCustomerSettlementCommandHandler
    : IRequestHandler<UpdateCustomerSettlementCommand, Guid>
{
    private readonly IAppDbContext _context;
    public UpdateCustomerSettlementCommandHandler(IAppDbContext context) => _context = context;

    public async Task<Guid> Handle(
        UpdateCustomerSettlementCommand request,
        CancellationToken cancellationToken)
    {
        var settlement = await _context.CustomerSettlements
            .FirstOrDefaultAsync(s => s.CustomerId == request.CustomerId
                                   && s.Year == request.Year
                                   && s.Month == request.Month,
                                 cancellationToken)
            ?? throw new NotFoundException(
                "CustomerSettlement",
                $"customer {request.CustomerId} for {request.Year}-{request.Month:D2}");

        var figures = await CustomerSettlementService.ComputeAsync(
            _context, request.CustomerId, request.Year, request.Month, cancellationToken);

        settlement.TotalNumberOfOrdersPlaced             = figures.OrdersPlaced;
        settlement.TotalNumberOfOrderDelivered           = figures.OrdersDelivered;
        settlement.TotalCODCompanyCollectedForPackages   = figures.CodCollectedForPackages;
        settlement.TotalCompanyServicePriceOwedToCompany = figures.CompanyServicePriceOwed;
        settlement.UpdatedAt                             = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return settlement.Id;
    }
}
