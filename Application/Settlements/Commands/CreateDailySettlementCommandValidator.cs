using FluentValidation;

namespace Application.Settlements.Commands;

public sealed class CreateDailySettlementCommandValidator
    : AbstractValidator<CreateDailySettlementCommand>
{
    public CreateDailySettlementCommandValidator()
    {
        RuleFor(x => x.CourierId)
            .NotEmpty().WithMessage("CourierId is required.");

        RuleFor(x => x.Date)
            .NotEmpty().WithMessage("Date is required.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Date cannot be in the future.");
    }
}