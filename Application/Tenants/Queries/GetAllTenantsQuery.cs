using Application.Common.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>Admin-facing view of a white-label tenant (assignment dropdown + management UI).</summary>
public sealed record TenantDto(
    Guid Id, string Host, string DisplayName, bool IsActive,
    string? LogoUrl, string? PrimaryColor);

public sealed record GetAllTenantsQuery : IRequest<IReadOnlyList<TenantDto>>;

public sealed class GetAllTenantsQueryHandler
    : IRequestHandler<GetAllTenantsQuery, IReadOnlyList<TenantDto>>
{
    private readonly IAppDbContext _context;
    public GetAllTenantsQueryHandler(IAppDbContext context) => _context = context;

    public async Task<IReadOnlyList<TenantDto>> Handle(
        GetAllTenantsQuery request, CancellationToken cancellationToken)
        => await _context.Tenants
            .AsNoTracking()
            .OrderBy(t => t.DisplayName)
            .Select(t => new TenantDto(t.Id, t.Host, t.DisplayName, t.IsActive, t.LogoUrl, t.PrimaryColor))
            .ToListAsync(cancellationToken);
}
