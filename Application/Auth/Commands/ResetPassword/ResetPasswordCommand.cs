using Application.Auth.Shared;
using Application.Common.Interfaces;
using Application.Common.Validation;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ValidationException = Application.Common.Exceptions.ValidationException;

namespace Application.Auth.Commands.ResetPassword;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// Final step of the SMS-code reset: the ticket issued by <c>VerifyPasswordResetCodeCommand</c>
/// proves the code was entered correctly. The ticket is consumed on success.
/// </summary>
public sealed record ResetPasswordCommand(
    string Ticket,
    string NewPassword,
    string ConfirmNewPassword
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class ResetPasswordCommandValidator
    : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator()
    {
        RuleFor(x => x.Ticket).NotEmpty();

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
    private readonly IOneTimeCodeHasher _hasher;

    public ResetPasswordCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager,
        IOneTimeCodeHasher hasher)
    {
        _context     = context;
        _userManager = userManager;
        _hasher      = hasher;
    }

    public async Task Handle(
        ResetPasswordCommand request,
        CancellationToken cancellationToken)
    {
        string ticketHash = _hasher.Hash(PasswordResetCodePolicy.TicketContext, request.Ticket);

        PasswordResetToken? record = await _context.PasswordResetTokens
            .FirstOrDefaultAsync(t => t.TicketHash == ticketHash && !t.IsUsed, cancellationToken);

        if (record is null || record.TicketExpiresAt is null || record.TicketExpiresAt <= CustomTime.Now)
            throw PasswordResetErrors.Fail(PasswordResetErrors.TicketInvalid,
                "Your verification has expired. Please start again.");

        ApplicationUser user = await _userManager.FindByIdAsync(record.UserId)
            ?? throw PasswordResetErrors.Fail(PasswordResetErrors.TicketInvalid,
                "Your verification has expired. Please start again.");

        // The full Identity token stays server-side.
        IdentityResult result = await _userManager.ResetPasswordAsync(
            user, record.IdentityToken, request.NewPassword);

        if (!result.Succeeded)
            throw new ValidationException(
                result.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));

        record.IsUsed = true;   // the ticket cannot be replayed
        await _context.SaveChangesAsync(cancellationToken);
    }
}
