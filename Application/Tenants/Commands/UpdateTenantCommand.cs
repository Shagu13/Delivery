using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Commands;

/// <summary>Admin: edit a tenant's host, branding (display name / logo / color), and active flag.</summary>
public sealed record UpdateTenantCommand(
    Guid    TenantId,
    string  Host,
    string  DisplayName,
    string? LogoUrl,
    string? PrimaryColor,
    bool    IsActive
) : IRequest;

public sealed class UpdateTenantCommandValidator : AbstractValidator<UpdateTenantCommand>
{
    public UpdateTenantCommandValidator()
    {
        RuleFor(x => x.Host).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.LogoUrl).MaximumLength(500);
        RuleFor(x => x.PrimaryColor).MaximumLength(20);
    }
}

public sealed class UpdateTenantCommandHandler : IRequestHandler<UpdateTenantCommand>
{
    private readonly IAppDbContext _context;
    public UpdateTenantCommandHandler(IAppDbContext context) => _context = context;

    public async Task Handle(UpdateTenantCommand request, CancellationToken cancellationToken)
    {
        var tenant = await _context.Tenants
            .FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken)
            ?? throw new NotFoundException(nameof(Tenant), request.TenantId);

        var host = TenantHost.Normalize(request.Host);
        if (host.Length == 0)
            throw new Application.Common.Exceptions.ValidationException(new[] { new ValidationFailure("Host", "A valid host is required.") });

        // Host must stay unique across other tenants.
        if (await _context.Tenants.AnyAsync(t => t.Id != request.TenantId && t.Host.ToLower() == host, cancellationToken))
            throw new Application.Common.Exceptions.ValidationException(new[] { new ValidationFailure("Host", "Another tenant already uses this host.") });

        tenant.Host         = host;
        tenant.DisplayName  = request.DisplayName.Trim();
        tenant.LogoUrl      = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl.Trim();
        tenant.PrimaryColor = string.IsNullOrWhiteSpace(request.PrimaryColor) ? null : request.PrimaryColor.Trim();
        tenant.IsActive     = request.IsActive;

        await _context.SaveChangesAsync(cancellationToken);
    }
}
