using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Tenants.Commands;

/// <summary>
/// Admin: onboard a white-label tenant — creates the Tenant row and its co-admin login
/// (a TenantAdmin <see cref="ApplicationUser"/>) in one step. Host must be unique.
/// </summary>
public sealed record CreateTenantCommand(
    string  Host,
    string  DisplayName,
    string? LogoUrl,
    string? PrimaryColor,
    string  CoAdminFirstName,
    string  CoAdminLastName,
    string  CoAdminEmail,
    string  CoAdminPassword
) : IRequest<Guid>;

public sealed class CreateTenantCommandValidator : AbstractValidator<CreateTenantCommand>
{
    public CreateTenantCommandValidator()
    {
        RuleFor(x => x.Host).NotEmpty().MaximumLength(150);
        RuleFor(x => x.DisplayName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.LogoUrl).MaximumLength(500);
        RuleFor(x => x.PrimaryColor).MaximumLength(20);
        RuleFor(x => x.CoAdminFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CoAdminLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CoAdminEmail).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.CoAdminPassword).NotEmpty().MinimumLength(8);
    }
}

public sealed class CreateTenantCommandHandler : IRequestHandler<CreateTenantCommand, Guid>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public CreateTenantCommandHandler(IAppDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<Guid> Handle(CreateTenantCommand request, CancellationToken cancellationToken)
    {
        var host = TenantHost.Normalize(request.Host);
        if (host.Length == 0)
            throw new Application.Common.Exceptions.ValidationException(new[] { new ValidationFailure("Host", "A valid host is required.") });

        if (await _context.Tenants.AnyAsync(t => t.Host.ToLower() == host, cancellationToken))
            throw new Application.Common.Exceptions.ValidationException(new[] { new ValidationFailure("Host", "A tenant with this host already exists.") });

        // Co-admin login (role TenantAdmin), email used as the username.
        var coAdmin = new ApplicationUser
        {
            UserName  = request.CoAdminEmail,
            Email     = request.CoAdminEmail,
            FirstName = request.CoAdminFirstName,
            LastName  = request.CoAdminLastName,
            Role      = "TenantAdmin",
        };

        var created = await _userManager.CreateAsync(coAdmin, request.CoAdminPassword);
        if (!created.Succeeded)
            throw new Application.Common.Exceptions.ValidationException(created.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));

        await _userManager.AddToRoleAsync(coAdmin, "TenantAdmin");

        var tenant = new Tenant
        {
            Host                   = host,
            DisplayName            = request.DisplayName.Trim(),
            LogoUrl                = string.IsNullOrWhiteSpace(request.LogoUrl) ? null : request.LogoUrl.Trim(),
            PrimaryColor           = string.IsNullOrWhiteSpace(request.PrimaryColor) ? null : request.PrimaryColor.Trim(),
            AdminApplicationUserId = coAdmin.Id,
            IsActive               = true,
        };

        _context.Tenants.Add(tenant);
        await _context.SaveChangesAsync(cancellationToken);

        return tenant.Id;
    }
}
