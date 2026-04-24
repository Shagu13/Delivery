using Application.Common.Exceptions;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;
using ValidationException = FluentValidation.ValidationException;

namespace Application.Customers.Commands.ChangePassword;

// ── Command ───────────────────────────────────────────────────────────────────

public sealed record ChangePasswordCommand(
    string ApplicationUserId,
    string CurrentPassword,
    string NewPassword
) : IRequest;

// ── Validator ─────────────────────────────────────────────────────────────────

public sealed class ChangePasswordCommandValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordCommandValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(100)
            .Matches("[A-Z]").WithMessage("New password must contain at least one uppercase letter.")
            .Matches("[0-9]").WithMessage("New password must contain at least one number.");
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────

public sealed class ChangePasswordCommandHandler : IRequestHandler<ChangePasswordCommand>
{
    private readonly UserManager<ApplicationUser> _userManager;
    public ChangePasswordCommandHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task Handle(ChangePasswordCommand request, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(request.ApplicationUserId)
            ?? throw new NotFoundException(nameof(ApplicationUser), request.ApplicationUserId);

        var result = await _userManager.ChangePasswordAsync(
            user, request.CurrentPassword, request.NewPassword);

        if (!result.Succeeded)
        {
            var failures = result.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new ValidationException(failures);
        }
    }
}
