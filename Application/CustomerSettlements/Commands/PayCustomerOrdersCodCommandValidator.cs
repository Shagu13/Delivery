using FluentValidation;

namespace Application.CustomerSettlements.Commands;

public sealed class PayCustomerOrdersCommandValidator
    : AbstractValidator<PayCustomerOrdersCommand>
{
    public PayCustomerOrdersCommandValidator()
    {
        RuleFor(x => x.CustomerId)
            .NotEmpty().WithMessage("CustomerId is required.");

        RuleFor(x => x.Allocations)
            .NotEmpty().WithMessage("At least one order allocation is required.");

        RuleForEach(x => x.Allocations).ChildRules(a =>
        {
            a.RuleFor(x => x.OrderId).NotEmpty().WithMessage("OrderId is required.");
            a.RuleFor(x => x.Amount).GreaterThan(0m).WithMessage("Allocation amount must be greater than zero.");
        });
    }
}
