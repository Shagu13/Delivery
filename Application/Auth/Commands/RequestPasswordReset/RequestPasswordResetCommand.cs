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
    string PhoneNumber,
    string ResetBaseUrl
) : IRequest;

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
            .Matches(@"^\d{9,13}$").WithMessage("Invalid phone number format.");

        RuleFor(x => x.ResetBaseUrl).NotEmpty();
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class RequestPasswordResetCommandHandler
    : IRequestHandler<RequestPasswordResetCommand>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IPasswordResetSmsService _passwordResetSms;

    public RequestPasswordResetCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager,
        IPasswordResetSmsService passwordResetSms)
    {
        _context          = context;
        _userManager      = userManager;
        _passwordResetSms = passwordResetSms;
    }

    public async Task Handle(
        RequestPasswordResetCommand request,
        CancellationToken cancellationToken)
    {
        var phone = request.PhoneNumber.Trim().TrimStart('+');
        var email = request.Email.Trim();

        // Email is the unique account key (Identity UserName). Since a phone number can
        // now be shared across several business accounts, we resolve the account by email
        // and use the phone as an extra confirmation that it matches the one on file.
        var user = await _userManager.FindByEmailAsync(email);

        // Silent return — never reveal whether the account exists
        if (user is null) return;

        // Phone lives on Customer, not ApplicationUser — confirm it matches this account.
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.ApplicationUserId == user.Id
                                   && c.PhoneNumber == phone, cancellationToken);

        if (customer is null) return;

        // Invalidate any previous unused tokens for this user to keep the table clean
        var oldTokens = await _context.PasswordResetTokens
            .Where(t => t.UserId == user.Id && !t.IsUsed && t.ExpiresAt > DateTime.UtcNow)
            .ToListAsync(cancellationToken);
        foreach (var old in oldTokens)
            old.IsUsed = true;

        // Generate Identity's cryptographic reset token (stored server-side only)
        var identityToken = await _userManager.GeneratePasswordResetTokenAsync(user);

        // Generate a short 10-char uppercase code for the SMS URL
        // Guid.NewGuid().ToString("N") = 32 hex chars, take first 10 → ~1 trillion combos
        var shortCode = Guid.NewGuid().ToString("N")[..10].ToUpper();

        _context.PasswordResetTokens.Add(new PasswordResetToken
        {
            Code          = shortCode,
            UserId        = user.Id,
            IdentityToken = identityToken,
            ExpiresAt     = DateTime.UtcNow.AddHours(2)
        });

        await _context.SaveChangesAsync(cancellationToken);

        // SMS link is now short — only the code is exposed, never the Identity token
        var resetLink = $"{request.ResetBaseUrl}?code={shortCode}";

        await _passwordResetSms.SendPasswordResetLinkAsync(
            customer.PhoneNumber,
            resetLink,
            cancellationToken);
    }
}
