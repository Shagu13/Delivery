using Application.Common.Interfaces;
using Application.GroupOrders.Commands.CreateGroupOrder;
using Domain.Enums;
using FluentValidation;

namespace Application.GroupOrders.Commands.AddOrdersToGroupOrder;

public sealed class AddOrdersToGroupOrderCommandValidator
    : AbstractValidator<AddOrdersToGroupOrderCommand>
{
    public AddOrdersToGroupOrderCommandValidator(IAppDbContext context)
    {
        RuleFor(x => x.GroupOrderId).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();

        RuleFor(x => x.Orders)
            .NotEmpty().WithMessage("At least one package is required.")
            .Must(o => o.Count <= 100).WithMessage("Cannot add more than 100 packages at once.");

        // Returns are standalone orders, never part of a batch — appending only applies
        // to Send/Exchange packages.
        RuleForEach(x => x.Orders)
            .Must(o => o.OrderType != OrderType.Return)
            .WithMessage("Return orders cannot be added to a batch.")
            .SetValidator(new CreateOrderDtoValidator(context));
    }
}
