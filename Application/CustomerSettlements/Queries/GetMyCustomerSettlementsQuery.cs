using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Customer-facing (read-only): the authenticated customer's own per-batch invoices,
/// newest first, derived live. Optionally filtered to the batches placed on a single day.
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

        return await CustomerSettlementProjection.ForCustomerAsync(
            _context, customer.Id, customer.BusinessName, request.Date, cancellationToken,
            excludeWalkIn: true);
    }
}
