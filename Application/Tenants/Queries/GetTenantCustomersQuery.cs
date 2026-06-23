using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>A tenant's own sub-customers, for the co-admin settlement picker. Scoped by TenantId (JWT claim).</summary>
public sealed record TenantCustomerDto(Guid Id, string BusinessName, bool IsActive);

public sealed record GetTenantCustomersQuery(Guid TenantId)
    : IRequest<IReadOnlyList<TenantCustomerDto>>;

public sealed class GetTenantCustomersQueryHandler
    : IRequestHandler<GetTenantCustomersQuery, IReadOnlyList<TenantCustomerDto>>
{
    private readonly IAppDbContext _context;
    public GetTenantCustomersQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<TenantCustomerDto>> Handle(
        GetTenantCustomersQuery request, CancellationToken cancellationToken)
        => await _context.Customers
            .Where(c => c.TenantId == request.TenantId)
            .OrderBy(c => c.BusinessName)
            .Select(c => new TenantCustomerDto(c.Id, c.BusinessName, c.IsActive))
            .ToListAsync(cancellationToken);
}
