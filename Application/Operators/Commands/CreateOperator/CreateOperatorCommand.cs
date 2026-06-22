using Application.Common.Exceptions;
using Domain;
using FluentValidation;
using FluentValidation.Results;
using MediatR;
using Microsoft.AspNetCore.Identity;

namespace Application.Operators.Commands.CreateOperator;

/// <summary>
/// Creates an Operator login (ApplicationUser with Role == "Operator").
/// Returns the new ApplicationUser's Id.
/// </summary>
public sealed record CreateOperatorCommand(
    string FirstName,
    string LastName,
    string Username,
    string Password
) : IRequest<string>;

public sealed class CreateOperatorCommandValidator : AbstractValidator<CreateOperatorCommand>
{
    public CreateOperatorCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);

        RuleFor(x => x.Username)
            .NotEmpty()
            .MaximumLength(50)
            .Matches(@"^[a-zA-Z0-9_.-]+$")
            .WithMessage("Username may only contain letters, digits, underscores, hyphens, and dots.");

        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(100);
    }
}

public sealed class CreateOperatorCommandHandler
    : IRequestHandler<CreateOperatorCommand, string>
{
    private readonly UserManager<ApplicationUser> _userManager;

    public CreateOperatorCommandHandler(UserManager<ApplicationUser> userManager)
        => _userManager = userManager;

    public async Task<string> Handle(CreateOperatorCommand request, CancellationToken cancellationToken)
    {
        var user = new ApplicationUser
        {
            UserName  = request.Username,
            Email     = $"{request.Username}@operator.local",
            FirstName = request.FirstName.Trim(),
            LastName  = request.LastName.Trim(),
            Role      = "Operator"
        };

        var createResult = await _userManager.CreateAsync(user, request.Password);
        if (!createResult.Succeeded)
        {
            var failures = createResult.Errors
                .Select(e => new ValidationFailure(e.Code, e.Description));
            throw new Application.Common.Exceptions.ValidationException(failures);
        }

        await _userManager.AddToRoleAsync(user, "Operator");

        return user.Id;
    }
}
