using FluentValidation;

using Domain;
namespace Application.Settlements.Commands;

public sealed class CreateCourierSettlementCommandValidator
    : AbstractValidator<CreateCourierSettlementCommand>
{
    public CreateCourierSettlementCommandValidator()
    {
        RuleFor(x => x.CourierId)
            .NotEmpty().WithMessage("CourierId is required.");

        RuleFor(x => x.Date)
            .NotEmpty().WithMessage("Date is required.")
            .LessThanOrEqualTo(DateOnly.FromDateTime(CustomTime.Now))
            .WithMessage("Date cannot be in the future.");

        // When a partial amount is supplied it must be non-negative.
        // (The upper bound — not exceeding earned salary — is enforced in the
        // handler, which is where TotalCourierSalary is known.)
        RuleFor(x => x.PartialAmountPaid)
            .GreaterThanOrEqualTo(0m)
            .When(x => x.PartialAmountPaid.HasValue)
            .WithMessage("PartialAmountPaid cannot be negative.");
    }
}