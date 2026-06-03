using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin preview of a customer's month: live figures computed from current orders
/// plus the saved settlement row (if any).
/// </summary>
public sealed record GetCustomerSettlementPreviewQuery(
    Guid CustomerId,
    int  Year,
    int  Month
) : IRequest<CustomerSettlementPreviewDto>;

public sealed class GetCustomerSettlementPreviewQueryHandler
    : IRequestHandler<GetCustomerSettlementPreviewQuery, CustomerSettlementPreviewDto>
{
    private readonly IAppDbContext _context;
    public GetCustomerSettlementPreviewQueryHandler(IAppDbContext context) => _context = context;

    public async Task<CustomerSettlementPreviewDto> Handle(
        GetCustomerSettlementPreviewQuery request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        var figures = await CustomerSettlementService.ComputeAsync(
            _context, request.CustomerId, request.Year, request.Month, cancellationToken);

        var existing = await _context.CustomerSettlements
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.CustomerId == request.CustomerId
                                   && s.Year == request.Year
                                   && s.Month == request.Month,
                                 cancellationToken);

        return new CustomerSettlementPreviewDto(
            CustomerId:              customer.Id,
            CustomerBusinessName:    customer.BusinessName,
            Year:                    request.Year,
            Month:                   request.Month,
            OrdersPlaced:            figures.OrdersPlaced,
            OrdersDelivered:         figures.OrdersDelivered,
            CodCollectedForPackages: figures.CodCollectedForPackages,
            CompanyServicePriceOwed: figures.CompanyServicePriceOwed,
            ExistingSettlement:      existing is null
                                        ? null
                                        : CustomerSettlementService.ToDto(existing, customer.BusinessName)
        );
    }
}
