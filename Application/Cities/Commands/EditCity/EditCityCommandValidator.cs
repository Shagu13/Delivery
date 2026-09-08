using FluentValidation;

namespace Application.Cities.Commands.EditCity;

public sealed class EditCityCommandValidator : AbstractValidator<EditCityCommand>
{
    public EditCityCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CityName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CityNameGeo).MaximumLength(100).When(x => x.CityNameGeo != null);
    }
}
