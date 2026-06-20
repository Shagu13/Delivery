using FluentValidation;

namespace Application.GroupOrders.Commands.MoveOrderToGroupOrder;

public sealed class MoveOrderToGroupOrderCommandValidator : AbstractValidator<MoveOrderToGroupOrderCommand>
{
    public MoveOrderToGroupOrderCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.TargetGroupOrderId).NotEmpty();
    }
}
