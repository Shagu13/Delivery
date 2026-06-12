using FluentValidation;

namespace Application.Orders.Commands;

public sealed class UpdateOrderByCustomerCommandValidator : AbstractValidator<UpdateOrderByCustomerCommand>
{
    public UpdateOrderByCustomerCommandValidator()
    {
        RuleFor(x => x.RecipientFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientLastName) .NotEmpty().MaximumLength(100);
        RuleFor(x => x.RecipientPhone)    .NotEmpty().MaximumLength(20);
        RuleFor(x => x.RecipientAddress)  .NotEmpty().MaximumLength(250);
        RuleFor(x => x.AmountToCollectForPackage)
            .GreaterThanOrEqualTo(0).When(x => x.AmountToCollectForPackage.HasValue);
    }
}
