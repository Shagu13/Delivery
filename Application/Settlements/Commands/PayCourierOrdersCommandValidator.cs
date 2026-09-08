using FluentValidation;

namespace Application.Settlements.Commands;

public sealed class PayCourierOrdersCommandValidator : AbstractValidator<PayCourierOrdersCommand>
{
    public PayCourierOrdersCommandValidator()
    {
        RuleFor(x => x.CourierId)
            .NotEmpty().WithMessage("CourierId is required.");

        RuleFor(x => x.Flow).IsInEnum();

        RuleFor(x => x.Allocations)
            .NotEmpty().WithMessage("At least one order allocation is required.");

        RuleForEach(x => x.Allocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });
    }
}
