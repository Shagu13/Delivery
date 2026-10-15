using Application.Auth.Shared;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Auth.Commands.VerifyPasswordResetCode;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>Checks the 6-digit SMS code and, if right, returns a single-use reset ticket.</summary>
public sealed record VerifyPasswordResetCodeCommand(string Email, string Code) : IRequest<string>;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class VerifyPasswordResetCodeCommandValidator
    : AbstractValidator<VerifyPasswordResetCodeCommand>
{
    public VerifyPasswordResetCodeCommandValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Code)
            .NotEmpty().WithMessage("Enter the 6-digit code.")
            .Matches(@"^\d{6}$").WithMessage("The code must be 6 digits.");
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class VerifyPasswordResetCodeCommandHandler
    : IRequestHandler<VerifyPasswordResetCodeCommand, string>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IOneTimeCodeHasher _hasher;

    public VerifyPasswordResetCodeCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager,
        IOneTimeCodeHasher hasher)
    {
        _context     = context;
        _userManager = userManager;
        _hasher      = hasher;
    }

    public async Task<string> Handle(
        VerifyPasswordResetCodeCommand request,
        CancellationToken cancellationToken)
    {
        ApplicationUser? user = await _userManager.FindByEmailAsync(
            PasswordResetCodePolicy.NormalizeEmail(request.Email));

        PasswordResetToken? record = user is null
            ? null
            : await _context.PasswordResetTokens
                .Where(t => t.UserId == user.Id && !t.IsUsed && t.CodeHash != null)
                .OrderByDescending(t => t.CreatedAt)
                .FirstOrDefaultAsync(cancellationToken);

        if (user is null || record is null)
            throw PasswordResetErrors.Fail(PasswordResetErrors.CodeExpired,
                "This code has expired. Please request a new one.");

        DateTime now = CustomTime.Now;
        CodeCheck check = PasswordResetCodePolicy.CheckCode(
            record, _hasher.Hash(user.Id, request.Code), now);

        switch (check)
        {
            case CodeCheck.Accepted:
                string ticket = PasswordResetCodePolicy.NewTicket();
                record.TicketHash      = _hasher.Hash(PasswordResetCodePolicy.TicketContext, ticket);
                record.TicketExpiresAt = now.AddMinutes(PasswordResetCodePolicy.TicketLifetimeMinutes);
                await _context.SaveChangesAsync(cancellationToken);
                return ticket;

            case CodeCheck.Wrong:
                await _context.SaveChangesAsync(cancellationToken);   // persist the attempt
                int left = PasswordResetCodePolicy.MaxAttempts - record.Attempts;
                throw left > 0
                    ? PasswordResetErrors.Fail(PasswordResetErrors.CodeWrong,
                        $"Incorrect code. {left} attempt(s) left.")
                    : PasswordResetErrors.Fail(PasswordResetErrors.TooManyAttempts,
                        "Too many wrong attempts. Please request a new code.");

            case CodeCheck.Expired:
                throw PasswordResetErrors.Fail(PasswordResetErrors.CodeExpired,
                    "This code has expired. Please request a new one.");

            default:
                throw PasswordResetErrors.Fail(PasswordResetErrors.TooManyAttempts,
                    "Too many wrong attempts. Please request a new code.");
        }
    }
}
