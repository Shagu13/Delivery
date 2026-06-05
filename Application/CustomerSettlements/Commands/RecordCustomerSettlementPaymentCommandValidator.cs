using FluentValidation;

namespace Application.CustomerSettlements.Commands;

public sealed class RecordCustomerSettlementPaymentCommandValidator
    : AbstractValidator<RecordCustomerSettlementPaymentCommand>
{
    public RecordCustomerSettlementPaymentCommandValidator()
    {
        RuleFor(x => x.SettlementId)
            .NotEmpty().WithMessage("SettlementId is required.");

        // At least one payment direction must be supplied.
        RuleFor(x => x)
            .Must(x => x.CodPaidByCompany.HasValue || x.ServicePaidToCompany.HasValue)
            .WithMessage("Provide a COD payment, a service payment, or both.");

        RuleFor(x => x.CodPaidByCompany!.Value)
            .GreaterThan(0m).When(x => x.CodPaidByCompany.HasValue)
            .WithMessage("COD payment must be greater than zero.");

        RuleFor(x => x.ServicePaidToCompany!.Value)
            .GreaterThan(0m).When(x => x.ServicePaidToCompany.HasValue)
            .WithMessage("Service payment must be greater than zero.");
    }
}
