using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Customer-facing (read-only): the authenticated customer's own monthly
/// settlements, newest first. Optionally filtered to a single year.
/// </summary>
public sealed record GetMyCustomerSettlementsQuery(
    string CustomerUserId,
    int?   Year
) : IRequest<IReadOnlyList<CustomerSettlementDto>>;

public sealed class GetMyCustomerSettlementsQueryHandler
    : IRequestHandler<GetMyCustomerSettlementsQuery, IReadOnlyList<CustomerSettlementDto>>
{
    private readonly IAppDbContext _context;
    public GetMyCustomerSettlementsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<CustomerSettlementDto>> Handle(
        GetMyCustomerSettlementsQuery request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.ApplicationUserId == request.CustomerUserId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerUserId);

        var settlements = await _context.CustomerSettlements
            .AsNoTracking()
            .Where(s => s.CustomerId == customer.Id
                     && (request.Year == null || s.Year == request.Year))
            .OrderByDescending(s => s.Year).ThenByDescending(s => s.Month)
            .ToListAsync(cancellationToken);

        return settlements
            .Select(s => CustomerSettlementService.ToDto(s, customer.BusinessName))
            .ToList();
    }
}
