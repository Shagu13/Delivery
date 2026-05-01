using FluentValidation;

namespace Application.Settlements.Commands;

public sealed class CreateDailySettlementCommandValidator
    : AbstractValidator<CreateDailySettlementCommand>
{
    public CreateDailySettlementCommandValidator()
    {
        RuleFor(x => x.CourierId)
            .NotEmpty().WithMessage("CourierId is required.");

        RuleFor(x => x.TotalOrdersPickedUp)
            .GreaterThanOrEqualTo(0).WithMessage("TotalOrdersPickedUp cannot be negative.");

        RuleFor(x => x.TotalOrdersDelivered)
            .GreaterThanOrEqualTo(0).WithMessage("TotalOrdersDelivered cannot be negative.");

        RuleFor(x => x.TotalCompanyServiceRevenue)
            .GreaterThanOrEqualTo(0).WithMessage("TotalCompanyServiceRevenue cannot be negative.");

        RuleFor(x => x.TotalCourierSalary)
            .GreaterThanOrEqualTo(0).WithMessage("TotalCourierSalary cannot be negative.");

        RuleFor(x => x.TotalAmountOfCashCollected)
            .GreaterThanOrEqualTo(0).When(x => x.TotalAmountOfCashCollected.HasValue)
            .WithMessage("TotalAmountOfCashCollected cannot be negative.");
    }
}
