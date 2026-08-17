using FluentValidation;

namespace Application.Couriers.Commands.UpdateCourier;

public sealed class UpdateCourierCommandValidator : AbstractValidator<UpdateCourierCommand>
{
    public UpdateCourierCommandValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.IdNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.PhoneNumber).NotEmpty().MaximumLength(20);

        RuleFor(x => x.Username)
            .NotEmpty()
            .MaximumLength(50)
            .Matches(@"^[a-zA-Z0-9_.-]+$")
            .WithMessage("Username may only contain letters, digits, underscores, hyphens, and dots.");

        RuleFor(x => x.NewPassword)
            .MinimumLength(8)
            .MaximumLength(100)
            .When(x => !string.IsNullOrWhiteSpace(x.NewPassword));

        RuleFor(x => x.DefaultSalary)
            .GreaterThanOrEqualTo(0)
            .When(x => x.DefaultSalary.HasValue)
            .WithMessage("Default salary must be a non-negative value.");
    }
}
