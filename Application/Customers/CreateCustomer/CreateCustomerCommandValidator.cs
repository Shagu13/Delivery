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

        // Login
        RuleFor(x => x.Dto.Email)
            .NotEmpty()
            .MaximumLength(256)
            .EmailAddress()
            .WithMessage("Please provide a valid email address.");

        RuleFor(x => x.Dto.Password)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(100);
    }
}
