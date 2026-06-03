using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin: all saved monthly settlements for a customer, newest first.
/// Optionally filtered to a single year.
/// </summary>
public sealed record GetCustomerSettlementsQuery(
    Guid CustomerId,
    int? Year
) : IRequest<IReadOnlyList<CustomerSettlementDto>>;

public sealed class GetCustomerSettlementsQueryHandler
    : IRequestHandler<GetCustomerSettlementsQuery, IReadOnlyList<CustomerSettlementDto>>
{
    private readonly IAppDbContext _context;
    public GetCustomerSettlementsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CustomerSettlementDto>> Handle(
        GetCustomerSettlementsQuery request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        var settlements = await _context.CustomerSettlements
            .AsNoTracking()
            .Where(s => s.CustomerId == request.CustomerId
                     && (request.Year == null || s.Year == request.Year))
            .OrderByDescending(s => s.Year).ThenByDescending(s => s.Month)
            .ToListAsync(cancellationToken);

        return settlements
            .Select(s => CustomerSettlementService.ToDto(s, customer.BusinessName))
            .ToList();
    }
}
