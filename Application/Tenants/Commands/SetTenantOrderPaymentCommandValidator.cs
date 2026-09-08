using FluentValidation;

namespace Application.Tenants.Commands;

public sealed class SetTenantOrderPaymentCommandValidator
    : AbstractValidator<SetTenantOrderPaymentCommand>
{
    public SetTenantOrderPaymentCommandValidator()
    {
        RuleFor(x => x.TenantId).NotEmpty().WithMessage("TenantId is required.");
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");

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
