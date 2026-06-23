using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Queries;

/// <summary>The tenant co-admin's own branding + homepage, for self-service editing.</summary>
public sealed record MyTenantBrandingDto(
    Guid    Id,
    string  Host,
    string  DisplayName,
    string? LogoUrl,
    string? PrimaryColor,
    string? HomepageJson);

public sealed record GetMyTenantBrandingQuery(Guid TenantId) : IRequest<MyTenantBrandingDto>;

public sealed class GetMyTenantBrandingQueryHandler
    : IRequestHandler<GetMyTenantBrandingQuery, MyTenantBrandingDto>
{
    private readonly IAppDbContext _context;
    public GetMyTenantBrandingQueryHandler(IAppDbContext context) => _context = context;

    public async Task<MyTenantBrandingDto> Handle(GetMyTenantBrandingQuery request, CancellationToken cancellationToken)
        => await _context.Tenants
            .Where(t => t.Id == request.TenantId)
            .Select(t => new MyTenantBrandingDto(t.Id, t.Host, t.DisplayName, t.LogoUrl, t.PrimaryColor, t.HomepageJson))
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException(nameof(Tenant), request.TenantId);
}
