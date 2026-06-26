using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin: a customer's per-batch invoices, newest first, derived live from the customer's
/// orders. Optionally filtered to the batches placed on a single day.
/// </summary>
public sealed record GetCustomerSettlementsQuery(
    Guid      CustomerId,
    DateOnly? Date
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

        return await CustomerSettlementProjection.ForCustomerAsync(
            _context, request.CustomerId, customer.BusinessName, request.Date, cancellationToken);
    }
}
