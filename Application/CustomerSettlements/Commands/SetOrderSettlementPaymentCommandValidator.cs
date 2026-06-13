using FluentValidation;

namespace Application.CustomerSettlements.Commands;

public sealed class SetOrderSettlementPaymentCommandValidator
    : AbstractValidator<SetOrderSettlementPaymentCommand>
{
    public SetOrderSettlementPaymentCommandValidator()
    {
        RuleFor(x => x.OrderId)
            .NotEmpty().WithMessage("OrderId is required.");

        // At least one payment direction must be toggled.
        RuleFor(x => x)
            .Must(x => x.CodPaid.HasValue || x.ServicePaid.HasValue)
            .WithMessage("Provide a COD payment, a service payment, or both.");

        RuleFor(x => x.CodPaidAmount!.Value)
            .GreaterThan(0m).When(x => x.CodPaidAmount.HasValue)
            .WithMessage("COD payment amount must be greater than zero.");

        RuleFor(x => x.ServicePaidAmount!.Value)
            .GreaterThan(0m).When(x => x.ServicePaidAmount.HasValue)
            .WithMessage("Service payment amount must be greater than zero.");
    }
}
