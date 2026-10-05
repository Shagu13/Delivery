using FluentValidation;

namespace Application.GroupOrders.Commands.AttachOrdersToGroupOrder;

public sealed class AttachOrdersToGroupOrderCommandValidator
    : AbstractValidator<AttachOrdersToGroupOrderCommand>
{
    public AttachOrdersToGroupOrderCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.OrderIds)
            .NotEmpty().WithMessage("Select at least one order to group.")
            .Must(ids => ids.Count <= 300).WithMessage("Cannot group more than 300 orders at once.");
    }
}
