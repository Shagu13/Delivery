using Application.Common.Exceptions;
using Application.Common.Interfaces;
using Application.Common.Validation;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ValidationException = FluentValidation.ValidationException;

namespace Application.Auth.Commands.ResetPassword;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// Accepts the short code from the SMS link, looks up the stored Identity token,
/// and resets the user's password. The short code is marked as used on success.
/// </summary>
public sealed record ResetPasswordCommand(
    string Code,              // Short 10-char code from the SMS link (?code=A3K9PQ2X1B)
    string NewPassword,
    string ConfirmNewPassword
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class ResetPasswordCommandValidator
    : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty();

        RuleFor(x => x.NewPassword).ApplyPasswordRules();

        RuleFor(x => x.ConfirmNewPassword)
            .NotEmpty()
            .Equal(x => x.NewPassword).WithMessage("Passwords do not match.");
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class ResetPasswordCommandHandler
    : IRequestHandler<ResetPasswordCommand>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public ResetPasswordCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager)
    {
        _context     = context;
        _userManager = userManager;
    }

    public async Task Handle(
        ResetPasswordCommand request,
        CancellationToken cancellationToken)
    {
        // Look up the short code record
        var record = await _context.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.Code == request.Code, cancellationToken);

        if (record is null || record.IsUsed || record.ExpiresAt <= CustomTime.Now)
            throw new ValidationException(new[]
            {
                new ValidationFailure("Code",
                    "This reset link is invalid or has expired. Please request a new one.")
            });

        var user = await _userManager.FindByIdAsync(record.UserId)
            ?? throw new NotFoundException(nameof(ApplicationUser), record.UserId);

        // Use the full Identity token stored server-side to reset the password
        var result = await _userManager.ResetPasswordAsync(
            user, record.IdentityToken, request.NewPassword);

        if (!result.Succeeded)
        {
            var failures = result.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new ValidationException(failures);
        }

        // Mark as used so the short code cannot be replayed
        record.IsUsed = true;
        await _context.SaveChangesAsync(cancellationToken);
    }
}
