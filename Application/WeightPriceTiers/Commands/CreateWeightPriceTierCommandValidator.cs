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

        RuleFor(x => x.CapitalPrice)
            .GreaterThan(0).WithMessage("Capital price must be greater than 0.")
            .When(x => x.CapitalPrice.HasValue);

        RuleFor(x => x.CityPrice)
            .GreaterThan(0).WithMessage("City price must be greater than 0.")
            .When(x => x.CityPrice.HasValue);

        RuleFor(x => x.DistrictPrice)
            .GreaterThan(0).WithMessage("District price must be greater than 0.")
            .When(x => x.DistrictPrice.HasValue);
    }
}
