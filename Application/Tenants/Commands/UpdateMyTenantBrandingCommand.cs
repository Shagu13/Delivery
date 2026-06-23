using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Commands;

/// <summary>
/// A tenant co-admin edits THEIR OWN storefront: header name, logo, primary color, and the
/// homepage content (opaque JSON block document). Scoped strictly to <see cref="TenantId"/>
/// (from the JWT claim). Does NOT touch Host / IsActive / co-admin — those stay Admin-only.
/// </summary>
public sealed record UpdateMyTenantBrandingCommand(
    Guid    TenantId,
    string  DisplayName,
    string? LogoUrl,
    string? PrimaryColor,
    string? HomepageJson
) : IRequest;

public sealed class UpdateMyTenantBrandingCommandValidator : AbstractValidator<UpdateMyTenantBrandingCommand>
{
    public UpdateMyTenantBrandingCommandValidator()
    {
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.LogoUrl).MaximumLength(500);
        RuleFor(x => x.PrimaryColor).MaximumLength(20);
        // Guard against an oversized blob; the homepage is a handful of small blocks.
        RuleFor(x => x.HomepageJson).MaximumLength(100_000);
    }
}

public sealed class UpdateMyTenantBrandingCommandHandler : IRequestHandler<UpdateMyTenantBrandingCommand>
{
    private readonly IAppDbContext _context;
    public UpdateMyTenantBrandingCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateMyTenantBrandingCommand request, CancellationToken cancellationToken)
    {
        var tenant = await _context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException(nameof(Tenant), request.TenantId);

        tenant.DisplayName  = request.DisplayName.Trim();
        tenant.LogoUrl      = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl.Trim();
        tenant.PrimaryColor = string.IsNullOrWhiteSpace(request.PrimaryColor) ? null : request.PrimaryColor.Trim();
        tenant.HomepageJson = string.IsNullOrWhiteSpace(request.HomepageJson) ? null : request.HomepageJson;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
