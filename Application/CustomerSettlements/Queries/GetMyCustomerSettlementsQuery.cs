using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Customer-facing (read-only): the authenticated customer's own per-batch invoices,
/// newest first. Optionally filtered to the batches placed on a single day.
/// </summary>
public sealed record GetMyCustomerSettlementsQuery(
    string    CustomerUserId,
    DateOnly? Date
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

        var settlements = await CustomerSettlementQueries
            .ForCustomer(_context, customer.Id, request.Date)
            .ToListAsync(cancellationToken);

        return settlements
            .Select(s => CustomerSettlementService.ToDto(s, customer.BusinessName))
            .ToList();
    }
}
