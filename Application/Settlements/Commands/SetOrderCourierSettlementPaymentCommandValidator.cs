using FluentValidation;

namespace Application.Settlements.Commands;

public sealed class SetOrderCourierSettlementPaymentCommandValidator
    : AbstractValidator<SetOrderCourierSettlementPaymentCommand>
{
    public SetOrderCourierSettlementPaymentCommandValidator()
    {
        RuleFor(x => x.OrderId)
            .NotEmpty().WithMessage("OrderId is required.");

        // At least one payment direction must be toggled.
        RuleFor(x => x)
            .Must(x => x.SalaryPaid.HasValue || x.CodTransferred.HasValue)
            .WithMessage("Toggle a salary payment, a COD transfer, or both.");

        RuleFor(x => x.SalaryPaidAmount!.Value)
            .GreaterThan(0m).When(x => x.SalaryPaidAmount.HasValue)
            .WithMessage("Salary payment amount must be greater than zero.");

        RuleFor(x => x.CodTransferredAmount!.Value)
            .GreaterThan(0m).When(x => x.CodTransferredAmount.HasValue)
            .WithMessage("COD transfer amount must be greater than zero.");
    }
}
