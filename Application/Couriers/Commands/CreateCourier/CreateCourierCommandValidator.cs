using Application.Couriers.DTOs;
using FluentValidation;

namespace Application.Couriers.Commands.CreateCourier;

public sealed class CreateCourierCommandValidator : AbstractValidator<CreateCourierCommand>
{
    public CreateCourierCommandValidator()
    {
        RuleFor(x => x.Dto).NotNull();
        RuleFor(x => x.Dto.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.IdNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Dto.PhoneNumber).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Dto.AssignedCity).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.AssignedDistrict).NotEmpty().MaximumLength(100);

        RuleFor(x => x.Dto.Username)
            .NotEmpty()
            .MaximumLength(50)
            .Matches(@"^[a-zA-Z0-9_.-]+$")
            .WithMessage("Username may only contain letters, digits, underscores, hyphens, and dots.");

        // Password complexity is enforced by Identity's PasswordOptions,
        // but we validate it is non-empty and has a minimum length here.
        RuleFor(x => x.Dto.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(100);

        RuleFor(x => x.Dto.DefaultSalary)
            .GreaterThanOrEqualTo(0)
            .When(x => x.Dto.DefaultSalary.HasValue)
            .WithMessage("Default salary must be a non-negative value.");

        // Only Tbilisi couriers get a standard per-order rate — other cities are priced
        // manually per order (see Courier.DefaultSalary doc comment).
        RuleFor(x => x.Dto.AssignedCity)
            .Must(city => city.Trim().Equals("Tbilisi", StringComparison.OrdinalIgnoreCase))
            .When(x => x.Dto.DefaultSalary.HasValue)
            .WithMessage("Default salary can only be set for couriers assigned to Tbilisi.")
            .OverridePropertyName("DefaultSalary");
    }
}
