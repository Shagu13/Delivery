using FluentValidation;

namespace Application.Settlements.Commands;

public sealed class SettleCourierNetCommandValidator : AbstractValidator<SettleCourierNetCommand>
{
    public SettleCourierNetCommandValidator()
    {
        RuleFor(x => x.CourierId)
            .NotEmpty().WithMessage("CourierId is required.");

        RuleFor(x => x)
            .Must(x => x.SalaryAllocations.Count + x.CodTransferAllocations.Count > 0)
            .WithMessage("At least one order allocation is required.")
            .OverridePropertyName("Allocations");

        RuleForEach(x => x.SalaryAllocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });

        RuleForEach(x => x.CodTransferAllocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });
    }
}
