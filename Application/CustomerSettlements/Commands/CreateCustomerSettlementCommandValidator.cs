using FluentValidation;

namespace Application.CustomerSettlements.Commands;

public sealed class CreateCustomerSettlementCommandValidator
    : AbstractValidator<CreateCustomerSettlementCommand>
{
    public CreateCustomerSettlementCommandValidator()
    {
        RuleFor(x => x.CustomerId)
            .NotEmpty().WithMessage("CustomerId is required.");

        RuleFor(x => x.Year)
            .InclusiveBetween(2000, 3000).WithMessage("Year is out of range.");

        RuleFor(x => x.Month)
            .InclusiveBetween(1, 12).WithMessage("Month must be between 1 and 12.");

        // The settlement month cannot be in the future.
        RuleFor(x => x)
            .Must(x => x.Year < DateTime.UtcNow.Year
                    || (x.Year == DateTime.UtcNow.Year && x.Month <= DateTime.UtcNow.Month))
            .WithMessage("The settlement month cannot be in the future.");
    }
}
