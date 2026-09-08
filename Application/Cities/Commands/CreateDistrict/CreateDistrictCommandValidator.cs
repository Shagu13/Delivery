using FluentValidation;

namespace Application.Cities.Commands.CreateDistrict;

public sealed class CreateDistrictCommandValidator : AbstractValidator<CreateDistrictCommand>
{
    public CreateDistrictCommandValidator()
    {
        RuleFor(x => x.CityId).NotEmpty();
        RuleFor(x => x.DistrictName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DistrictNameGeo).MaximumLength(100).When(x => x.DistrictNameGeo != null);
        RuleFor(x => x.CompanyServicePrice!.Value)
            .GreaterThanOrEqualTo(0m).When(x => x.CompanyServicePrice.HasValue)
            .WithMessage("Company service price must be zero or more.");
        RuleFor(x => x)
            .Must(x => !(x.IsCapitalTerritory && x.IsCityTerritory))
            .WithMessage("A district cannot be both capital territory and city territory.");
    }
}
