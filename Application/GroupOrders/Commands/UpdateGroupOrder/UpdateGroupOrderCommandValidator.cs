using FluentValidation;

namespace Application.GroupOrders.Commands.UpdateGroupOrder;

public sealed class UpdateGroupOrderCommandValidator : AbstractValidator<UpdateGroupOrderCommand>
{
    public UpdateGroupOrderCommandValidator()
    {
        RuleFor(x => x.SenderFirstName)    .NotEmpty().MaximumLength(100);
        RuleFor(x => x.SenderLastName)     .NotEmpty().MaximumLength(100);
        RuleFor(x => x.SenderBusinessName) .NotEmpty().MaximumLength(200);
        RuleFor(x => x.SenderPhone)        .NotEmpty().MaximumLength(30);
        RuleFor(x => x.SenderIdNumber)     .MaximumLength(50).When(x => x.SenderIdNumber != null);
        RuleFor(x => x.PickUpCity)         .NotEmpty().MaximumLength(100);
        RuleFor(x => x.PickUpDistrict)     .NotEmpty().MaximumLength(100);
        RuleFor(x => x.PickUpAddress)      .NotEmpty().MaximumLength(300);
        RuleFor(x => x.Note)               .MaximumLength(500).When(x => x.Note != null);
    }
}
