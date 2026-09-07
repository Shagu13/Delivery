using Application.Common.Validation;
using FluentValidation;

namespace Application.Customers.Commands.CreateCustomer;

public sealed class CreateCustomerCommandValidator : AbstractValidator<CreateCustomerCommand>
{
    public CreateCustomerCommandValidator()
    {
        RuleFor(x => x.Dto).NotNull();

        // Personal
        RuleFor(x => x.Dto.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.IdNumber).MaximumLength(50);
        RuleFor(x => x.Dto.BusinessName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.Dto.PhoneNumber).NotEmpty().MaximumLength(9);

        // Pickup address
        RuleFor(x => x.Dto.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.District).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Dto.Address).NotEmpty().MaximumLength(250);

        // Optional map-pin coordinates
        RuleFor(x => x.Dto.Latitude)
            .InclusiveBetween(-90, 90)
            .When(x => x.Dto.Latitude.HasValue);
        RuleFor(x => x.Dto.Longitude)
            .InclusiveBetween(-180, 180)
            .When(x => x.Dto.Longitude.HasValue);

        // Login
        RuleFor(x => x.Dto.Email)
            .NotEmpty()
            .MaximumLength(256)
            .EmailAddress()
            .WithMessage("Please provide a valid email address.");

        RuleFor(x => x.Dto.Password).ApplyPasswordRules();
    }
}
