using Application.Common.Exceptions;
using Application.Common.Validation;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Admins.Commands.ResetAdminPassword;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// System-admin override: sets a new password for another Admin without the old one.
/// Identity rotates the account's SecurityStamp as part of the reset, which is what
/// signs that admin out everywhere (see API/Auth/AdminSecurityStampValidator).
/// </summary>
public sealed record ResetAdminPasswordCommand(
    string AdminUserId,
    string NewPassword,
    string ConfirmNewPassword
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class ResetAdminPasswordCommandValidator : AbstractValidator<ResetAdminPasswordCommand>
{
    public ResetAdminPasswordCommandValidator()
    {
        RuleFor(x => x.NewPassword).ApplyPasswordRules();
        RuleFor(x => x.ConfirmNewPassword)
            .Equal(x => x.NewPassword)
            .WithMessage("Passwords do not match.");
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class ResetAdminPasswordCommandHandler : IRequestHandler<ResetAdminPasswordCommand>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public ResetAdminPasswordCommandHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task Handle(ResetAdminPasswordCommand request, CancellationToken cancellationToken)
    {
        ApplicationUser user = await _userManager.FindByIdAsync(request.AdminUserId)
            ?? throw new NotFoundException(nameof(ApplicationUser), request.AdminUserId);

        // Only Admin-role accounts, and never the system admin itself.
        if (SystemAdminAccount.IsSystemAdmin(user.UserName)
            || !await _userManager.IsInRoleAsync(user, "Admin"))
            throw new NotFoundException(nameof(ApplicationUser), request.AdminUserId);

        // No current password to verify — generate a reset token and apply directly.
        string         token  = await _userManager.GeneratePasswordResetTokenAsync(user);
        IdentityResult result = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);

        if (!result.Succeeded)
            throw new Application.Common.Exceptions.ValidationException(
                result.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));
    }
}
