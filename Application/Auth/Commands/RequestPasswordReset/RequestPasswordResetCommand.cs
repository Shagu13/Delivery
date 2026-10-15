using Application.Auth.Shared;
using Application.Common.Interfaces;
using Domain;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Application.Auth.Commands.RequestPasswordReset;

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record RequestPasswordResetCommand(
    string Email,
    string PhoneNumber
) : IRequest<RequestPasswordResetResult>;

/// <summary>Timings the client needs to drive the code screen's countdown and resend button.</summary>
public sealed record RequestPasswordResetResult(int ExpiresInSeconds, int ResendInSeconds);

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class RequestPasswordResetCommandValidator
    : AbstractValidator<RequestPasswordResetCommand>
{
    public RequestPasswordResetCommandValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty().WithMessage("Email is required.")
            .EmailAddress().WithMessage("Invalid email format.");

        RuleFor(x => x.PhoneNumber)
            .NotEmpty().WithMessage("Phone number is required.")
            .Matches(@"^\+?\d{9,13}$").WithMessage("Invalid phone number format.");
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class RequestPasswordResetCommandHandler
    : IRequestHandler<RequestPasswordResetCommand, RequestPasswordResetResult>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IPasswordResetSmsService _passwordResetSms;
    private readonly IOneTimeCodeHasher _hasher;

    public RequestPasswordResetCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager,
        IPasswordResetSmsService passwordResetSms,
        IOneTimeCodeHasher hasher)
    {
        _context          = context;
        _userManager      = userManager;
        _passwordResetSms = passwordResetSms;
        _hasher           = hasher;
    }

    public async Task<RequestPasswordResetResult> Handle(
        RequestPasswordResetCommand request,
        CancellationToken cancellationToken)
    {
        string email = PasswordResetCodePolicy.NormalizeEmail(request.Email);

        // Email is the unique account key (Identity UserName); the phone number can be shared
        // across accounts, so it only confirms that this email's account owns that number.
        ApplicationUser? user = await _userManager.FindByEmailAsync(email);

        string? destination = user is null
            ? null
            : await ResolvePhoneAsync(user.Id, request.PhoneNumber, cancellationToken);

        if (user is null || destination is null)
            throw PasswordResetErrors.Fail(PasswordResetErrors.AccountNotFound,
                "The email and phone number don't match any account. Please check them and try again.");

        DateTime now = CustomTime.Now;

        // Abuse guards — an SMS costs money and this endpoint is anonymous.
        List<DateTime> recent = await _context.PasswordResetTokens
            .AsNoTracking()
            .Where(t => t.UserId == user.Id && t.CreatedAt > now.AddHours(-1))
            .Select(t => t.CreatedAt)
            .ToListAsync(cancellationToken);

        if (recent.Count > 0)
        {
            int waitSeconds = (int)Math.Ceiling(
                recent.Max().AddSeconds(PasswordResetCodePolicy.ResendCooldownSeconds)
                    .Subtract(now).TotalSeconds);
            if (waitSeconds > 0)
                throw PasswordResetErrors.Fail(PasswordResetErrors.ResendTooSoon,
                    $"Please wait {waitSeconds} seconds before requesting a new code.");
        }

        if (recent.Count >= PasswordResetCodePolicy.MaxRequestsPerHour)
            throw PasswordResetErrors.Fail(PasswordResetErrors.TooManyRequests,
                "Too many code requests. Please try again in an hour.");

        string code = PasswordResetCodePolicy.NewCode();

        // Send first, persist after: a failed SMS leaves the user's previous code and the
        // resend cooldown untouched, so they can simply retry.
        SmsResult sms = await _passwordResetSms.SendPasswordResetCodeAsync(
            destination, code, PasswordResetCodePolicy.CodeLifetimeMinutes, cancellationToken);

        if (!sms.IsSuccess)
            throw sms.StatusCode == 400
                ? PasswordResetErrors.Fail(PasswordResetErrors.SmsInvalidPhone,
                    "We couldn't send an SMS to this phone number. Please contact support.")
                : PasswordResetErrors.Fail(PasswordResetErrors.SmsFailed,
                    "We couldn't send the SMS right now. Please try again in a few minutes.");

        // Only the newest code may work.
        List<PasswordResetToken> outstanding = await _context.PasswordResetTokens
            .Where(t => t.UserId == user.Id && !t.IsUsed)
            .ToListAsync(cancellationToken);
        foreach (PasswordResetToken old in outstanding)
            old.IsUsed = true;

        string identityToken = await _userManager.GeneratePasswordResetTokenAsync(user);

        _context.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId        = user.Id,
            CodeHash      = _hasher.Hash(user.Id, code),
            IdentityToken = identityToken,
            CreatedAt     = now,
            ExpiresAt     = now.AddMinutes(PasswordResetCodePolicy.CodeLifetimeMinutes),
        });
        await _context.SaveChangesAsync(cancellationToken);

        return new RequestPasswordResetResult(
            PasswordResetCodePolicy.CodeLifetimeMinutes * 60,
            PasswordResetCodePolicy.ResendCooldownSeconds);
    }

    /// <summary>The stored phone of the customer or courier behind this login, if it matches the one typed.</summary>
    private async Task<string?> ResolvePhoneAsync(string userId, string submitted, CancellationToken ct)
    {
        string? customerPhone = await _context.Customers
            .AsNoTracking()
            .Where(c => c.ApplicationUserId == userId)
            .Select(c => c.PhoneNumber)
            .FirstOrDefaultAsync(ct);
        if (customerPhone is not null && PasswordResetCodePolicy.PhonesMatch(customerPhone, submitted))
            return customerPhone;

        string? courierPhone = await _context.Couriers
            .AsNoTracking()
            .Where(c => c.ApplicationUserId == userId)
            .Select(c => c.PhoneNumber)
            .FirstOrDefaultAsync(ct);
        return courierPhone is not null && PasswordResetCodePolicy.PhonesMatch(courierPhone, submitted)
            ? courierPhone
            : null;
    }
}
