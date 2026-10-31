using FluentValidation;

namespace Application.CustomerSettlements.Commands;

public sealed class SettleCustomerNetCommandValidator
    : AbstractValidator<SettleCustomerNetCommand>
{
    public SettleCustomerNetCommandValidator()
    {
        RuleFor(x => x.CustomerId)
            .NotEmpty().WithMessage("CustomerId is required.");

        RuleFor(x => x)
            .Must(x => x.CodAllocations.Count + x.ServiceAllocations.Count > 0)
            .WithMessage("At least one order allocation is required.")
            .OverridePropertyName("Allocations");

        RuleForEach(x => x.CodAllocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });

        RuleForEach(x => x.ServiceAllocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });
    }
}
