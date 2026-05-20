using FluentValidation;

namespace Application.WeightPriceTiers.Commands;

public sealed class CreateWeightPriceTierCommandValidator
    : AbstractValidator<CreateWeightPriceTierCommand>
{
    public CreateWeightPriceTierCommandValidator()
    {
        RuleFor(x => x.MinWeightKg)
            .GreaterThanOrEqualTo(0).WithMessage("Minimum weight must be 0 or more.");

        RuleFor(x => x.MaxWeightKg)
            .GreaterThan(x => x.MinWeightKg)
            .WithMessage("Maximum weight must be greater than minimum weight.");

        RuleFor(x => x.Label)
            .MaximumLength(100).WithMessage("Label must not exceed 100 characters.")
            .When(x => x.Label is not null);

        // When not standard, a positive custom price is required
        RuleFor(x => x.CustomPrice)
            .NotNull().WithMessage("Custom price is required when IsStandard is false.")
            .GreaterThan(0).WithMessage("Custom price must be greater than 0.")
            .When(x => !x.IsStandard);

        // When standard, custom price must be null
        RuleFor(x => x.CustomPrice)
            .Null().WithMessage("Custom price must be empty when IsStandard is true.")
            .When(x => x.IsStandard);
    }
}
