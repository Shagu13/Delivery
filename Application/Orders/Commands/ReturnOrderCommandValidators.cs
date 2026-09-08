using Domain.Enums;
using FluentValidation;

namespace Application.Orders.Commands;

public sealed class AdminSetReturnOrderStatusCommandValidator : AbstractValidator<AdminSetReturnOrderStatusCommand>
{
    // The standalone Return flow: Pending → CourierAssignedToPickUp → PickedUpFromRecipient
    // → DeliveredReturnOrderToWarehouse → ReturnedToSender. Admin/Operator may move an order
    // forward or backward within it; taking it out of the flow (e.g. cancellation) has its
    // own command.
    private static readonly OrderStatus[] ReturnFlow =
    {
        OrderStatus.Pending,
        OrderStatus.CourierAssignedToPickUp,
        OrderStatus.PickedUpFromRecipient,
        OrderStatus.DeliveredReturnOrderToWarehouse,
        OrderStatus.ReturnedToSender,
    };

    public AdminSetReturnOrderStatusCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty();
        RuleFor(x => x.NewStatus)
            .Must(s => ReturnFlow.Contains(s))
            .WithMessage("NewStatus must be a status in the Return flow.");
    }
}
