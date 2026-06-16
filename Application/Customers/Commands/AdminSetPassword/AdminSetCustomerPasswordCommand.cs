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

namespace Application.Customers.Commands.AdminSetPassword;

// ── Command ───────────────────────────────────────────────────────────────────

/// <summary>
/// Admin override: sets a brand-new password for a customer without knowing the
/// old one. Used when a customer cannot recover their account themselves.
/// </summary>
public sealed record AdminSetCustomerPasswordCommand(
    Guid CustomerId,
    string NewPassword
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class AdminSetCustomerPasswordCommandValidator
    : AbstractValidator<AdminSetCustomerPasswordCommand>
{
    public AdminSetCustomerPasswordCommandValidator()
    {
        RuleFor(x => x.NewPassword).ApplyPasswordRules();
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class AdminSetCustomerPasswordCommandHandler
    : IRequestHandler<AdminSetCustomerPasswordCommand>
{
    private readonly IAppDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    public AdminSetCustomerPasswordCommandHandler(
        IAppDbContext context,
        UserManager<ApplicationUser> userManager)
    {
        _context     = context;
        _userManager = userManager;
    }

    public async Task Handle(
        AdminSetCustomerPasswordCommand request,
        CancellationToken cancellationToken)
    {
        var customer = await _context.Customers
            .FirstOrDefaultAsync(c => c.Id == request.CustomerId, cancellationToken)
            ?? throw new NotFoundException("Customer", request.CustomerId);

        var user = await _userManager.FindByIdAsync(customer.ApplicationUserId)
            ?? throw new NotFoundException(nameof(ApplicationUser), customer.ApplicationUserId);

        // No current password to verify — generate a reset token and apply directly.
        var token  = await _userManager.GeneratePasswordResetTokenAsync(user);
        var result = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);

        if (!result.Succeeded)
        {
            var failures = result.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new ValidationException(failures);
        }
    }
}
