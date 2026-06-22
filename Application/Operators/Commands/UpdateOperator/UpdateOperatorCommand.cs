using Application.Common.Exceptions;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Operators.Commands.UpdateOperator;

/// <summary>
/// Edits an Operator's profile/credentials. NewPassword is optional —
/// when provided it force-resets the password (admin privilege).
/// </summary>
public sealed record UpdateOperatorCommand(
    string  Id,
    string  FirstName,
    string  LastName,
    string  Username,
    string? NewPassword
) : IRequest;

public sealed class UpdateOperatorCommandValidator : AbstractValidator<UpdateOperatorCommand>
{
    public UpdateOperatorCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);

        RuleFor(x => x.Username)
            .NotEmpty()
            .MaximumLength(50)
            .Matches(@"^[a-zA-Z0-9_.-]+$")
            .WithMessage("Username may only contain letters, digits, underscores, hyphens, and dots.");

        // Optional — only validated when a new password is actually supplied.
        RuleFor(x => x.NewPassword)
            .MinimumLength(8)
            .MaximumLength(100)
            .When(x => !string.IsNullOrWhiteSpace(x.NewPassword));
    }
}

public sealed class UpdateOperatorCommandHandler : IRequestHandler<UpdateOperatorCommand>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public UpdateOperatorCommandHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task Handle(UpdateOperatorCommand request, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(request.Id)
            ?? throw new NotFoundException(nameof(ApplicationUser), request.Id);

        if (!await _userManager.IsInRoleAsync(user, "Operator"))
            throw new NotFoundException(nameof(ApplicationUser), request.Id);

        user.FirstName = request.FirstName.Trim();
        user.LastName  = request.LastName.Trim();

        if (!string.Equals(user.UserName, request.Username, StringComparison.OrdinalIgnoreCase))
        {
            var setNameResult = await _userManager.SetUserNameAsync(user, request.Username);
            if (!setNameResult.Succeeded)
                throw new Application.Common.Exceptions.ValidationException(
                    setNameResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));

            // Keep the synthetic email aligned with the username so it stays unique.
            await _userManager.SetEmailAsync(user, $"{request.Username}@operator.local");
        }

        if (!string.IsNullOrWhiteSpace(request.NewPassword))
        {
            var token       = await _userManager.GeneratePasswordResetTokenAsync(user);
            var resetResult = await _userManager.ResetPasswordAsync(user, token, request.NewPassword);
            if (!resetResult.Succeeded)
                throw new Application.Common.Exceptions.ValidationException(
                    resetResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));
        }

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
            throw new Application.Common.Exceptions.ValidationException(
                updateResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description)));
    }
}
