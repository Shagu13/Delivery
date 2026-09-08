using FluentValidation;

namespace Application.Cities.Commands.CreateCity;

public sealed class CreateCityCommandValidator : AbstractValidator<CreateCityCommand>
{
    public CreateCityCommandValidator()
    {
        RuleFor(x => x.CityName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CityNameGeo).MaximumLength(100).When(x => x.CityNameGeo != null);
    }
}
