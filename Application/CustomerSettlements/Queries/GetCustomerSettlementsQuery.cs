using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.CustomerSettlements.Queries;

/// <summary>
/// Admin: a customer's per-batch invoices, newest first. Optionally filtered to the
/// batches placed on a single day.
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

        var settlements = await CustomerSettlementQueries
            .ForCustomer(_context, request.CustomerId, request.Date)
            .ToListAsync(cancellationToken);

        return settlements
            .Select(s => CustomerSettlementService.ToDto(s, customer.BusinessName))
            .ToList();
    }
}

/// <summary>Shared query shaping for per-batch invoice reads.</summary>
internal static class CustomerSettlementQueries
{
    public static IQueryable<Domain.CustomerSettlement> ForCustomer(
        IAppDbContext context, Guid customerId, DateOnly? date)
    {
        var query = context.CustomerSettlements
            .AsNoTracking()
            .Include(s => s.GroupOrder)
            .Include(s => s.Order)
            .Where(s => s.CustomerId == customerId && s.DateDeleted == null);

        if (date is DateOnly d)
        {
            var start = d.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var end   = start.AddDays(1);
            query = query.Where(s => s.CreatedAt >= start && s.CreatedAt < end);
        }

        return query.OrderByDescending(s => s.CreatedAt);
    }
}
