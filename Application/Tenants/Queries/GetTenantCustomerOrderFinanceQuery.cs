using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.CustomerSettlements.DTOs;
using Application.CustomerSettlements.Queries;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>
/// A tenant co-admin views one of their OWN sub-customers' order finance lines.
/// Guards ownership (the customer must belong to <see cref="TenantId"/>) then reuses the
/// existing admin per-order finance query, so the co-admin can never see another tenant's
/// (or a root/dilo) customer. TenantId comes from the JWT claim, never the request.
/// </summary>
public sealed record GetTenantCustomerOrderFinanceQuery(
    Guid      TenantId,
    Guid      CustomerId,
    DateOnly? Date,
    bool      Monthly = false
) : IRequest<IReadOnlyList<OrderFinanceLineDto>>;

public sealed class GetTenantCustomerOrderFinanceQueryHandler
    : IRequestHandler<GetTenantCustomerOrderFinanceQuery, IReadOnlyList<OrderFinanceLineDto>>
{
    private readonly IAppDbContext _context;
    private readonly ISender _sender;

    public GetTenantCustomerOrderFinanceQueryHandler(IAppDbContext context, ISender sender)
    {
        _context = context;
        _sender  = sender;
    }

    public async Task<IReadOnlyList<OrderFinanceLineDto>> Handle(
        GetTenantCustomerOrderFinanceQuery request, CancellationToken cancellationToken)
    {
        bool owned = await _context.Customers.AnyAsync(
            c => c.Id == request.CustomerId && c.TenantId == request.TenantId, cancellationToken);
        if (!owned)
            throw new NotFoundException("Customer", request.CustomerId);

        return await _sender.Send(
            new GetCustomerOrderFinanceLinesQuery(request.CustomerId, request.Date, request.Monthly),
            cancellationToken);
    }
}
