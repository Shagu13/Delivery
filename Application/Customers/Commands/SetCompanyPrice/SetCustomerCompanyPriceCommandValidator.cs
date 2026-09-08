using FluentValidation;

namespace Application.Customers.Commands.SetCompanyPrice;

public sealed class SetCustomerCompanyPriceCommandValidator
    : AbstractValidator<SetCustomerCompanyPriceCommand>
{
    public SetCustomerCompanyPriceCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();

        RuleFor(x => x.CapitalPrice!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.CapitalPrice.HasValue)
            .WithMessage("Company prices must be zero or more.");

        RuleFor(x => x.CityPrice!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.CityPrice.HasValue)
            .WithMessage("Company prices must be zero or more.");

        RuleFor(x => x.DistrictPrice!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.DistrictPrice.HasValue)
            .WithMessage("Company prices must be zero or more.");
    }
}
